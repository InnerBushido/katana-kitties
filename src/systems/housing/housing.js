import * as THREE from 'three';
import { PLAYER_STYLE } from '../../core/palette.js';
import {
  HOME_SITES, SITE_BY_ID, HOUSE_BY_ID, ITEM_BY_ID, PRESET_BY_ID, ROOM_TYPE_BY_ID, HOME_SELL, priceOf, SPEED_STRIP,
} from './catalog.js';
import { loadStore, saveStore, newHome, homeOf, normalise, newer, exportFile, importFile } from './homestore.js';
import { HomeIsle } from './homeisle.js';
import { HomeBridge, solveHomeRoads } from './homebridge.js';
import { Roshi } from './roshi.js';
import { PurchaseScene } from './purchasescene.js';
import { JUKEBOX, hasRecording } from './jukebox.js';
import { Koi } from './koi.js';
import { Farm } from './farm.js';
import { Kendo } from './kendo.js';
import { autoLayout } from './editor.js';
import { HousingCards } from './cards.js';

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

export class Housing {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.store = loadStore();
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
    /** Seats currently looking at a PREVIEW (the island recoloured to her). */
    this.preview = null;
    this.koi = new Koi(this);
    this.farm = new Farm(this);
    this.kendo = new Kendo(this);
    this.built = false;
  }

  /* ------------------------------- setup -------------------------------- */

  build() {
    const scene = this.game.scene;
    this.isles = HOME_SITES.map((s) => new HomeIsle(s, this.world));
    for (const I of this.isles) I.build(scene);
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
      I.setHome(H, H ? this.coloursOf(H) : null);
      const B = this.bridges[k];
      if (B) this._dressBridge(k);
    }
    this.koi.sync();
    this.farm.sync();
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

  save() {
    saveStore(this.store);
    this.game.savegame?.touch?.();
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
    B.setLocked(this.locked(H));
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
    if (!this.built) return;
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
        if (B?.solid && H && !this.allowed(p, H)) this._doorPush(p, B.doorSegment(), r, H);
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
      if (B?.solid && H && !this.allowed(p, H)) this._doorPush(p, B.doorSegment(), r, H);
      if (!H || !I.shell) continue;
      if (d2 > (I.houseR + 4) ** 2) {
        this._obstacles(p, I, r);
        continue;
      }
      for (const w of I.walls) {
        if (pos.y + 1.5 < w.y0 || pos.y > w.y1) continue;
        this._segPush(p, w, r);
      }
      // the front door itself
      if (!this.allowed(p, H) && I.doorWorld) {
        const D = I.shell.door;
        const a = I.local(-D.w / 2, D.z);
        const b = I.local(D.w / 2, D.z);
        const seg = { ax: a.x, az: a.z, bx: b.x, bz: b.z, y0: I.groundY, y1: I.groundY + 5 };
        if (this._segPush(p, seg, r)) this._refuse(p, H);
      }
      this._roomWall(p, I, H);
      this._obstacles(p, I, r);
    }
  }

  _obstacles(p, I, r) {
    for (const o of I.obstacles) {
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
    const def = HOUSE_BY_ID[H.house];
    if (!def || H.owners.length < 2 && !def.rooms.some((r) => r.claim)) return;
    const n = p.style?.name;
    const f = I.floorAt(p.position.x, p.position.y, p.position.z);
    if (f < 0) return;
    const L = I.toLocal(p.position.x, p.position.z);
    for (const room of def.rooms) {
      if (!room.claim || room.floor !== f) continue;
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
      const w = I.local(L.x, L.z);
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
    if (!this.built) return;
    this.time += dt;
    this._pumpRoads();
    const players = this.game.players ?? [];
    for (const I of this.isles) {
      I.update(dt, this.time);
      const H = I.home;
      // the bubble shows while it is keeping somebody here out
      I.bubble.visible = !!H && this.locked(H) && players.some((p) => !this.allowed(p, H));
    }
    for (const [k, B] of this.bridges.entries()) {
      const H = this.isles[k].home;
      if (B && H) B.setLocked(this.locked(H));
    }
    this._mounts(players);
    this._holoHome(players);
    this._payBank(players);
    this._trackMusic(players);
    this.roshi?.update(dt, players);
    this.koi.update(dt);
    this.farm.update(dt);
    this.kendo.update(dt, players);
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
    /* A kitten browsing the boombox hears the row under her cursor (cards.js
       `drive`), and only for as long as the card is open. */
    const id = this.audition?.id ?? (this.musicSite ? this.store.jukebox?.[this.musicSite] ?? JUKEBOX[0].id : null);
    if (!id) return null;
    const T = JUKEBOX.find((t) => t.id === id) ?? JUKEBOX[0];
    /* A RECORDING THAT IS NOT ON DISK PLAYS ITS PROCEDURAL STAND-IN, which
       is non-negotiable 9: delete public/music and the jukebox still plays. */
    if (this.game.audio?.fileMissing?.(T.id)) return T.fallback;
    return hasRecording(T.id) ? T.id : T.fallback;
  }

  /* ------------------------------ cameras ------------------------------- */

  /** Roshi's tour: her pane flies out to the island she is looking at. */
  cameraFocus(p) {
    const b = this.browsing.get(p.index);
    if (b) {
      const I = this.isleOf(b.site);
      if (!I) return null;
      const t = this.time * 0.12;
      (b.centre ??= new THREE.Vector3()).set(I.x, I.groundY + 6, I.z);
      return { centre: b.centre, aim: true, dist: 95, pitch: 0.42, yaw: I.ry + Math.PI + Math.sin(t) * 0.7 };
    }
    return this.koi.cameraFocus?.(p) ?? null;
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
      if (scene) { I.cutaway(-1); I.wallMat.setCuts?.(camera.position, []); continue; }
      let floor = -1;
      const seen = [];
      const floors = [];
      for (const i of members ?? players.map((_, k) => k)) {
        const p = players[i];
        if (!p) continue;
        const f = I.floorAt(p.position.x, p.position.y, p.position.z);
        if (f >= 0) floor = floor < 0 ? f : Math.min(floor, f);
        if (Math.hypot(p.position.x - I.x, p.position.z - I.z) < I.houseR + 14 && seen.length < 4) {
          seen.push(new THREE.Vector3(p.position.x, p.position.y + 1.4, p.position.z));
          floors.push(p.position.y - 0.05);
        }
      }
      I.cutaway(floor);
      I.wallMat.setCuts?.(camera.position, seen, floors);
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
    if (presetId && PRESET_BY_ID[presetId]) autoLayout(H, PRESET_BY_ID[presetId], I);
    this.store.homes[siteId] = H;
    this.save();
    I.setHome(H, this.coloursOf(H));
    this.koi.sync();
    this.farm.sync();
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
    this.farm.sync();
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
    this.farm.sync();
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
      if (!B?.solid || !B.jukeboxSpot) continue;
      if (Math.hypot(p.position.x - B.jukeboxSpot.x, p.position.z - B.jukeboxSpot.z) < 3.4) {
        return { act: 'jukebox', k, home: this.isles[k].home };
      }
    }
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
    const s = this._spotFor(p);
    if (!s) return null;
    const own = s.home && s.home.owners.includes(p.style.name);
    const words = {
      roshi: 'TALK TO ROSHI',
      jukebox: own ? 'PICK THE MUSIC' : 'LISTEN',
      door: own ? 'MY HOME' : 'KNOCK',
      koi: 'THE KOI POND',
      harvest: 'HARVEST BAMBOO',
      animals: 'THE ANIMALS',
      kendo: 'KENDO GEAR',
      holodeck: 'HOLODECK',
      chest: 'STORAGE CHEST',
      nap: 'NAP',
      cook: 'COOK',
      drum: 'PLAY THE DRUM',
      bell: 'RING THE BELL',
      soak: 'SOAK',
      volley: 'VOLLEYBALL',
      climb: 'CLIMB UP',
      pray: 'PRAY',
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
      case 'door':
        if (s.home.owners.includes(p.style.name)) C.open(p.index, 'home', { site: s.home.site });
        else G.toast(this.locked(s.home)
          ? `Knock knock! ${s.home.owners.join(' & ')}'s door is locked.`
          : `Come on in — ${s.home.owners.join(' & ')} left the door open!`, p.index);
        return true;
      case 'koi':
        C.open(p.index, 'koi', { site: s.home.site });
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
        this.holodeck(p, s);
        return true;
      case 'chest':
        if (s.home.owners.includes(p.style.name)) C.open(p.index, 'home', { site: s.home.site, state: 'chest' });
        else G.toast('That chest is not yours to open!', p.index);
        return true;
      default:
        this._fun(p, s);
        return true;
    }
  }

  /** The small things — a line and a sound each. PLACEHOLDER behaviour. */
  _fun(p, s) {
    const G = this.game;
    const lines = {
      nap: `${p.name} curls up for a nap… zzz. (Fully rested!)`,
      cook: `${p.name} makes onigiri! Delicious. (Cooking mini-game coming soon.)`,
      drum: 'DON! DON! DOKO-DON!',
      bell: 'GONNNNG…',
      soak: `${p.name} sinks into the onsen. Ahhh, rosy cheeks.`,
      volley: `${p.name} bats the ball over the net! (Volleyball match coming soon.)`,
      climb: `${p.name} climbs up the treehouse ladder!`,
      pray: `${p.name} claps twice and makes a wish.`,
    };
    G.toast(lines[s.act] ?? 'Hmm.', p.index);
    G.audio?.play?.(s.act === 'drum' || s.act === 'bell' ? 'land' : 'menu');
    if (s.act === 'climb') { p.velocity.y = 26; }
    if (s.act === 'nap' || s.act === 'soak') { p.hp = p.maxHp ?? p.hp; }
  }

  /**
   * THE HOLODECK: gear up and go — the Dream Dojo's own way in, from home.
   * "Enters the simulator where players normally spawn, and returns to her
   * house on exit." The Dream Dojo owns the simulator; this asks it to take
   * her from here, and remembers where to put her back.
   */
  holodeck(p, s) {
    const D = this.game.dream;
    if (!D?.enterFrom) {
      this.game.toast('The holodeck is warming up… (needs the Dream Dojo built — PLACEHOLDER)', p.index);
      return;
    }
    const ok = D.enterFrom(p, { x: s.x, y: s.y, z: s.z });
    if (!ok) this.game.toast('The holodeck will not start right now.', p.index);
  }

  /**
   * BACK HOME FROM THE HOLODECK: once she has been in the sim (`seen`) and
   * the Dream Dojo has finished walking her out and un-suiting her (no
   * phase), she is stood back in her holodeck room. A tournament or a story
   * scene that pulled her out wins: the arena wants her where it put her,
   * so the way home is forgotten rather than taken mid-scene.
   */
  _holoHome(players) {
    const D = this.game.dream;
    for (const p of players) {
      const R = p?.homeReturn;
      if (!R) continue;
      if (this.game.tournament?.active) { p.homeReturn = null; continue; }
      if (D?.realmOf?.(p) === 'sim') { R.seen = true; continue; }
      const s = D?.stateOf?.(p.index);
      if (s?.phase) continue;
      if (this.game._sceneActive?.()) continue;
      p.homeReturn = null;
      // Never in: she walked off before the rise. Leave her at the arcade.
      if (!R.seen) continue;
      p.position.set(R.x, R.y + 0.2, R.z);
      p.velocity?.set?.(0, 0, 0);
      this.game.toast(`${p.name} — back home from the holodeck.`, p.index);
    }
  }

  /** Is a seat's pad being driven by housing outside of a card? */
  busy(index) {
    return this.kendo.kiaiBusy(index);
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
    if (!snap) return;
    const theirs = normalise(snap);
    this.store = newer(this.store, theirs);
    saveStore(this.store);
    if (this.built) this._applyStore();
    for (let k = 0; k < this.bridges.length; k++) this._dressBridge(k);
  }

  exportJson() { exportFile(this.store); }

  async importJson(index) {
    const s = await importFile();
    if (!s) { this.game.toast('That file is not a Katana Kitties homes file.', index); return; }
    this.store = s;
    saveStore(this.store);
    this._applyStore();
    for (let k = 0; k < this.bridges.length; k++) this._dressBridge(k);
    this.game.toast(`Loaded ${Object.keys(s.homes).length} home(s) from the file.`, index);
  }

  /* ------------------------------ helpers ------------------------------- */

  static get DAY() { return DAY; }
  itemPrice(id) { return this.price(ITEM_BY_ID[id]?.mult ?? 1); }
  roomPrice(id) { return this.price(ROOM_TYPE_BY_ID[id]?.mult ?? 0); }
  housePrice(id) { return this.price(HOUSE_BY_ID[id]?.mult ?? 8); }
  site(id) { return SITE_BY_ID[id]; }
}
