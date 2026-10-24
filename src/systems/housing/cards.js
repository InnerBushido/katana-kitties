import {
  HOME_SITES, SITE_BY_ID, HOUSES, HOUSE_BY_ID, ITEMS, ITEM_BY_ID, PRESETS, PRESET_BY_ID, ROOM_TYPES, HOME_SELL,
  FREE_ANNEX, BUILDABLE_HOUSES, roomsListed, LINK_STYLES, LINK_BY_ID, homeRooms, roomById, houseSpecs,
  roomHas, roomWith, ROOM_FEATS, DOOR_MATS,
} from './catalog.js';
import { houseWhy } from './editor.js';
import { portSpots, linkBlockers, defaultVia } from './links.js';
import { JUKEBOX, hasRecording } from './jukebox.js';
import { footprint, firstFit, firstYardSpot, wallSlots, wallFree, ITEM_SELL } from './editor.js';
import { buildWhy, commitBuild, removeBuilt, pickList, yardBody, stepToward, BUILD_KEYS, PICK_KEYS, CUSTOM_PICK_KEYS, freeTurn, rotStepOf, linkOf } from './build.js';
import { stylesFor, LOOK_MUL } from './models.js';
import { YARD_BUILT, RAISE_T } from './homeisle.js';
import { Preview } from './preview.js';
import { holoKit, holoWhyRemove, holoTubes, HOLO_TUBE_ID, HOLO_MAX_TUBES } from './holodeck.js';
import { KOI_COLOURS } from './koi.js';
import { careBuff, ANIMALS } from './farm.js';
import { petBoost, petLevel, BOOST_NAME, PLAY } from './petplay.js';

/* ---------------------------------------------------------------------------
   THE HOUSING CARDS — Roshi's counter, her home, the jukebox, the pond, the
   pen, the rod, and the "are you sure" every co-owner has to answer.

   ONE PROVIDER FOR ALL OF THEM, plugged into the dealer's per-pane cards
   (`Inspector.openExt`), so they are drawn in HER pane, driven by HER pad,
   and the other three panes carry on (non-negotiable 7: one player drives a
   menu, and the screen says who).

   EVERY CARD IS A STACK OF VIEWS. JUMP picks a row; a row either pushes a
   view, does a thing, or opens a confirmation; INTERACT pops one view, and
   popping the last one closes the card. Each view is a function of the seat
   and the store, rebuilt on every paint, so a row can never be stale.

   CONFIRMATIONS (non-negotiable 7): every irreversible thing — buying,
   selling a home, selling a thing back — is a two-row view whose cursor
   opens on the "no" row, whose rows say what they DO, and whose YES is the
   moment the fact changes.

   MORE THAN ONE OWNER MUST AGREE. Buying a castle together and selling any
   shared home open a CONSENT card in each other owner's own pane; the deal
   happens on the last yes, and any no cancels it for everybody, with a toast
   that says who said no.
--------------------------------------------------------------------------- */

const ARROW = { left: '◀', up: '▲', down: '▼', right: '▶' };
/** How long the camera stays on a new house after its rise has finished (`_v_raising`). */
export const RAISE_HOLD = 0.8;
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pts = (n) => `${Math.round(n).toLocaleString()} pts`;
/** "EMBER'S", "EMBER & FROST'S" — the whole thing in capitals or none of it. */
export const possessive = (names) => `${[].concat(names).join(' & ').toUpperCase()}'S`;
/** What Roshi pays back for everything in a room. */
export function roomRefund(Hs, R) {
  return (R?.items ?? []).reduce((a, q) => a + (q.free ? 0 : Math.round(Hs.itemPrice(q.id) * ITEM_SELL)), 0) + roomTypeRefund(Hs, R);
}

/**
 * WHAT THE ROOM ITSELF SELLS BACK FOR: a holodeck or a kendo dojo, at the
 * same rate as the furniture. Richard, Oct 2026: "Selling a holodeck, or
 * converting it to a tatami room should refund money to the player, same
 * for the kendo dojo." It refunded the things IN the room and kept the
 * price of the room. `typePaid` is what she paid (written by
 * `changeRoomType`); a room made before that was written down is refunded
 * on today's price, which is the price it was sold at in every build that
 * did not record one.
 */
export function roomTypeRefund(Hs, R) {
  // a mixed room's dojo and holodeck, each at what was paid for it (`setRoomFeat`)
  const feats = Object.values(R?.feats ?? {}).reduce((a, v) => a + Math.round((v || 0) * ITEM_SELL), 0);
  if (!R?.type || R.type === 'living') return feats;
  const paid = Number.isFinite(R.typePaid) ? R.typePaid : Hs.roomPrice(R.type);
  return Math.round(paid * ITEM_SELL);
}

/**
 * Turn a room into another type, SELLING its furniture back first — so a
 * kitten a few points short of a holodeck can pay for it with the furniture
 * it replaces. What she is paid back comes off what she is recorded as having
 * put into the home, so a later SELL MY HOME does not refund it twice.
 */
export function changeRoomType(Hs, p, H, R, type, price, room = null) {
  const refund = roomRefund(Hs, R);
  if (p.score + refund < price) return { ok: false, why: `${p.name} needs ${price - p.score - refund} more points.` };
  const n = p.style?.name;
  if (refund) {
    p.score += refund;
    if (n && H.paid) H.paid[n] = Math.max(0, (H.paid[n] ?? 0) - refund);
  }
  R.items = [];
  if (!Hs.spend(p, H, price)) return { ok: false, why: 'Not enough points.' };
  R.type = type;
  if (price) R.typePaid = price; else delete R.typePaid;
  // a holodeck comes with its kit, stood where it always stood; she moves it after
  if (type === 'holodeck' && room) R.items = holoKit(room);
  Hs.changed(H);
  return { ok: true, refund };
}

/**
 * A MIXED ROOM'S DOJO OR HOLODECK, ADDED OR SOLD BACK (catalog `mixed`).
 * Adding one moves the furniture standing on its zone to the nearest free
 * tatami, and only what will not fit anywhere is sold back (`displaced`,
 * which the card asks with); a holodeck comes with its kit, in its strip.
 * Selling one pays Roshi's rate on what was paid for it, and the holodeck's
 * kit goes with it. Pure apart from `Hs` (spend, pay, changed).
 */
export function displaced(room, R, feat) {
  const c = room.mixed?.[feat];
  if (!c) return { move: [], sell: [] };
  const into = roomWith(room, { feats: { ...(R.feats ?? {}), [feat]: 0 } });
  const keep = [];
  const out = [];
  for (const q of R.items ?? []) {
    const it = ITEM_BY_ID[q.id];
    const [w, d] = it ? footprint(it, q.rot ?? 0) : [1, 1];
    const hit = !it?.holo && q.gx < c[2] && q.gx + w > c[0] && q.gz < c[3] && q.gz + d > c[1];
    (hit ? out : keep).push(q);
  }
  const move = [];
  const sell = [];
  for (const q of out) {
    const at = firstFit(into, [...keep, ...move], ITEM_BY_ID[q.id]);
    if (at) move.push({ ...q, ...at }); else sell.push(q);
  }
  return { keep, move, sell };
}

export function setRoomFeat(Hs, p, H, room, R, feat, on) {
  const n = p.style?.name;
  if (on) {
    if (roomHas(R, feat)) return { ok: false, why: 'It already has one.' };
    const price = Hs.roomPrice(feat);
    const D = displaced(room, R, feat);
    const back = D.sell.reduce((a, q) => a + (q.free ? 0 : Math.round(Hs.itemPrice(q.id) * ITEM_SELL)), 0);
    if (p.score + back < price) return { ok: false, why: `${p.name} needs ${price - p.score - back} more points.` };
    if (back) { p.score += back; if (n && H.paid) H.paid[n] = Math.max(0, (H.paid[n] ?? 0) - back); }
    if (!Hs.spend(p, H, price)) return { ok: false, why: 'Not enough points.' };
    R.items = [...D.keep, ...D.move];
    R.feats = { ...(R.feats ?? {}), [feat]: price };
    if (feat === 'holodeck') {
      const others = R.items.filter((q) => !ITEM_BY_ID[q.id]?.holo);
      R.items = [...others, ...holoKit(room, [], others)];
    }
    Hs.changed(H);
    return { ok: true, moved: D.move.length, sold: D.sell.length, back };
  }
  if (R?.feats?.[feat] == null) return { ok: false, why: 'There is none to sell.' };
  const back = Math.round((R.feats[feat] || 0) * ITEM_SELL);
  p.score += back;
  if (n && H.paid) H.paid[n] = Math.max(0, (H.paid[n] ?? 0) - back);
  Hs.game?.onScoreChanged?.(p);
  delete R.feats[feat];
  if (feat === 'holodeck') R.items = (R.items ?? []).filter((q) => !ITEM_BY_ID[q.id]?.holo);
  Hs.changed(H);
  return { ok: true, back };
}

/** "You have 2" — how many of this thing are in this home already, anywhere:
 *  the rooms, the yard and the outdoor decorations. Richard: "the player
 *  should be shown how much of each furniture they already own, if none,
 *  should show 0." */
export function ownedCount(H, id) {
  let n = 0;
  for (const R of Object.values(H?.rooms ?? {})) n += (R.items ?? []).filter((q) => q.id === id).length;
  for (const R of Object.values(H?.rooms ?? {})) n += (R.wall ?? []).filter((q) => q.id === id).length;
  n += (H?.outdoor ?? []).filter((q) => q.id === id).length;
  return n;
}

export class HousingCards {
  constructor(game, housing) {
    this.game = game;
    this.H = housing;
    this.st = new Map();
    // the yard's built things are built for real for the card, on the island the shop is for
    this.preview = new Preview((id) => {
      const it = ITEM_BY_ID[id];
      if (!it || it.path || !YARD_BUILT.has(id)) return null;
      return yardBody(this.H.isleOf(this._previewSite) ?? this.H.isles?.[0], it);
    });
    /** A deal waiting on other owners: { kind, site, house, preset, seats, yes, driver }. */
    this.pending = null;
  }

  /* ------------------------------- opening ------------------------------ */

  open(index, kind, args = {}) {
    const st = { kind, stack: [{ v: kind, ...args }], fish: null };
    if (args.state) st.stack.push({ v: args.state, ...args });
    this.st.set(index, st);
    if (!this.game.inspector.openExt(index, this, `hs:${kind}`)) {
      this.st.delete(index);
      return false;
    }
    return true;
  }

  _top(index) {
    const st = this.st.get(index);
    return st?.stack[st.stack.length - 1] ?? null;
  }

  _push(index, view) {
    const st = this.st.get(index);
    st.stack.push(view);
    const c = this.game.inspector.cards[index];
    if (c) c.i = view.cursor ?? 0;
  }

  _pop(index) {
    const st = this.st.get(index);
    if (!st || st.stack.length <= 1) return false;
    const was = st.stack.pop();
    const c = this.game.inspector.cards[index];
    if (c) c.i = this._top(index).at ?? 0;
    if (was.v === 'site' || was.v === 'house') this.H.stopPreview();
    if (was.v === 'jukebox' && this.H.audition?.who === index) this.H.audition = null;
    if (was.v === 'shop') this.preview.hide(index);
    // backing out of a placement, or out of the shop, forgets where the last one went (`lastPut`)
    if ((was.v === 'build' && !was.placed) || was.v === 'shop') st.lastPut = null;
    return true;
  }

  /* ------------------------- the provider interface --------------------- */

  startRow(index) { return this._top(index)?.cursor ?? 0; }

  opened(index) {
    const top = this._top(index);
    if (top?.v === 'realtor') {
      this.H.browse(index, HOME_SITES[0].id);
      this.H.startWatch(index);
    }
  }

  closed(index) {
    // a knock left unanswered is a NO, and the visitor is told so
    const kn = this.st.get(index)?.stack.find((v) => v.v === 'knock');
    if (kn && !kn.answered) { kn.answered = true; this.H.answerKnock(this.game.players[index], kn, false); }
    this.H.browsing.delete(index);
    this.H.endWatch(index);
    if (this.H.preview?.who === index) this.H.stopPreview();
    if (this.H.audition?.who === index) this.H.audition = null;
    this.preview.hide(index);
    /* Closing her card is a NO — unless she already said yes (her card
       closes itself on a yes) and is not the one who asked. */
    const P = this.pending;
    if (P && P.seats.includes(index) && (index === P.driver || !P.yes.has(index))) this._cancelPending(index, true);
    this.st.delete(index);
  }

  rowCount(index) {
    return this._view(index).rows.length;
  }

  sig(index, c) {
    const top = this._top(index);
    const p = this.game.players[index];
    return [this.st.get(index)?.stack.length, top?.v, top?.room, top?.kind, top?.sel, top?.gx, top?.gz, top?.rot, top?.rotStep, top?.side, top?.k, top?.at, top?.rev,
      top?.v === 'build' && top.kind === 'yard' ? `${Math.round(top.x * 2)},${Math.round(top.z * 2)}` : '',
      // a bridge's card says whether it reaches, which changes with every door, turn count and corner
      top?.v === 'build' && top.kind === 'link'
        ? JSON.stringify([top.a, top.cur, top.counting, top.turns, top.vk, top.vk != null ? top.via?.map((v) => [Math.round(v.x * 2), Math.round(v.z * 2), !!v.smooth]) : 0]) : '',
      p?.score, this.H.store.at, this.pending ? [...this.pending.yes].join(',') : '', c.i].join('|');
  }

  back(index) {
    const top = this._top(index);
    if (top?.v === 'raising') { this.game.toast('Hold on — it is going up!', index); return true; }
    if (top?.v === 'consent') { this._answer(index, false); return false; }
    return this._pop(index);
  }

  choose(index, c) {
    const V = this._view(index);
    const row = V.rows[c.i];
    if (!row) return null;
    if (row.disabled) {
      this.game.toast(row.why ?? 'Not right now.', index);
      this.game.audio?.play?.('menu');
      return null;
    }
    const top = this._top(index);
    if (top) top.at = c.i;
    return row.go?.() ?? null;
  }

  /** The editor and the rod take the pad themselves. */
  drive(index, pad, dt, c) {
    const top = this._top(index);
    if (top?.v === 'raising') {
      top.t += dt;
      if (top.t >= top.dur) this._pop(index);
      return true;
    }
    if (top?.v === 'build' || top?.v === 'pick') {
      const spent = this.H.builder.drive(index, pad, dt);
      this.H.builder.drawMap(index, c.el?.querySelector('canvas.hs-map'));
      return spent;
    }
    if (top?.v === 'shop') this.preview.draw(index, c.el?.querySelector('canvas.hs-prev'), dt);
    /* THE ROW UNDER THE CURSOR IS WHAT PLAYS. Richard: "the music should be
       playing so the player can preview the songs they like before choosing
       them. Can turn off once the player leaves the menu." `closed` and
       `_pop` take it away again; `Housing.musicTrack` reads it first. */
    if (top?.v === 'jukebox') {
      const t = JUKEBOX[c.i];
      if (t && this.H.audition?.id !== t.id) this.H.audition = { id: t.id, who: index };
    }
    return false;
  }

  tap(index, act) {
    const top = this._top(index);
    if (top?.v === 'build' || top?.v === 'pick') {
      const B = this.H.builder;
      const step = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[act];
      if (step && top.v === 'pick') {
        const L = pickList(this._home(top), top.kind, top.room);
        const k = L[top.at ?? 0] ? stepToward(L, L[top.at ?? 0], step[0], step[1]) : -1;
        if (k >= 0) top.at = k;
      } else if (step && (top.kind === 'yard' || top.kind === 'house')) { top.x += step[0] * 1.5; top.z += step[1] * 1.5; }
      else if (step && top.kind === 'link' && top.vk != null) { const v = top.via?.[top.vk]; if (v) { v.x += step[0] * 1.5; v.z += step[1] * 1.5; } }
      else if (step && top.kind === 'link' && top.counting) { if (step[0]) B.linkCount(index, top, step[0]); }
      else if (step && top.kind === 'link') this.H.builder.hopPort(top, step[0], step[1]);
      else if (act === 'rot' && top.kind === 'link') { if (top.vk != null) B.turnSmooth(index, top); else this.H.builder.portFloor(top); return; }
      else if (act === 'step' && top.kind === 'link') { if (top.counting && top.vk == null) B.linkTurns(index, top); return; }
      else if (step && top.kind === 'wall') B.hop(top, step[0], step[1]);
      else if (step) B.nudge(top, step[0], step[1]);
      if (act === 'rot') B.rotate(top);
      if (act === 'step') B.turnStep(index, top);
      if (act === 'sell') this.askSell(index, top);
    }
  }

  painted(index, c, el) {
    const top = this._top(index);
    if (top?.v === 'build' || top?.v === 'pick') this.H.builder.drawMap(index, el.querySelector('canvas.hs-map'));
    if (top?.v === 'shop') this.preview.draw(index, el.querySelector('canvas.hs-prev'), 0);
  }

  markup(index, c, back) {
    const V = this._view(index);
    const p = this.game.players[index];
    /* A GREYED ROW SAYS WHY ON ITS FACE, not only when pressed. Richard: "If
       a player cant afford to buy something, it should still appear in the
       list but be grayed out and tell the user they dont have enough points
       to buy it." The toast on a press stays too (non-negotiable 6) — this
       is the same sentence, said before she has to try. */
    const rows = V.rows.map((r, k) => `
      <div class="pc-row${k === c.i ? ' cursor' : ''}${r.disabled ? ' hs-off' : ''}" data-side="${index}" data-row="${k}">
        <b>${esc(r.title)}</b>${r.right ? `<span class="hs-right">${esc(r.right)}</span>` : ''}
        ${r.blurb ? `<div class="pc-dim">${esc(r.blurb)}</div>` : ''}
        ${r.disabled && r.why ? `<div class="hs-why">${esc(r.why)}</div>` : ''}
      </div>`).join('');
    return `<div class="pc-inner hs-card${V.build ? ' hs-buildcard' : ''}">
      <div class="pc-head"><span class="pc-who">${esc(p?.name ?? '')}</span> ${esc(V.head)}
        <span class="hs-purse">${pts(p?.score ?? 0)}</span></div>
      ${V.body ?? ''}
      <div class="pc-list">${rows}</div>
      <div class="pc-foot">${back(index, V.backWord ?? 'BACK')}
        <span>${V.foot ?? 'JUMP <b>choose</b> · INTERACT <b>back</b>'}</span></div>
    </div>`;
  }

  /* -------------------------------- views ------------------------------- */

  _view(index) {
    const top = this._top(index);
    const p = this.game.players[index];
    if (!top || !p) return { head: '', rows: [] };
    const fn = this[`_v_${top.v}`];
    return fn ? fn.call(this, index, p, top) : { head: '?', rows: [] };
  }

  /** ROSHI: the four islands. */
  _v_realtor(index, p, top) {
    const mine = this.H.homeOf(p);
    const rows = HOME_SITES.map((s) => {
      const H = this.H.store.homes[s.id];
      return {
        title: s.name,
        /* ALL CAPS, NAME AND ALL. `${name}'S` read "Ember'S" — a capital S
           on a name that is not in capitals (Richard, Oct 2026). */
        right: H ? possessive(H.owners) : 'FOR SALE',
        blurb: s.blurb,
        go: () => { this._push(index, { v: 'site', site: s.id }); return null; },
      };
    });
    if (mine) {
      rows.push({
        title: 'SELL MY HOME',
        blurb: `Roshi buys it back for ${Math.round(HOME_SELL * 100)}% of what was paid.`,
        go: () => { this._push(index, { v: 'sell', site: mine.site, cursor: 0 }); return null; },
      });
    }
    // The tour follows the cursor.
    const c = this.game.inspector.cards[index];
    const s = HOME_SITES[Math.min(c?.i ?? 0, HOME_SITES.length - 1)];
    this.H.browse(index, s.id);
    return { head: "AT ROSHI'S ISLAND SHOP", rows, backWord: 'LEAVE', foot: 'JUMP <b>look closer</b> · INTERACT <b>leave</b>' };
  }

  /** One island: its perks, and the three houses. */
  _v_site(index, p, top) {
    const s = SITE_BY_ID[top.site];
    this.H.browse(index, s.id);
    const H = this.H.store.homes[s.id];
    const mine = this.H.homeOf(p);
    const body = `<div class="hs-perks">${s.perks.map((k) => `<span>${esc(k)}</span>`).join('')}</div>`;
    if (H) {
      const def = HOUSE_BY_ID[H.house];
      const rows = [{ title: `${H.owners.join(' & ')} ${H.owners.length > 1 ? 'LIVE' : 'LIVES'} HERE`, blurb: `A ${def.name}.${def.owners > 1 ? '' : ' Not for sale.'}`, go: () => null }];
      // A SHARE OF A CASTLE, bought from its owners (Housing `joinHome`)
      if (def.owners > 1 && !H.owners.includes(p.style.name)) {
        const price = this.H.sharePrice(H);
        const here = new Set((this.game.players ?? []).map((q) => q?.style?.name));
        const missing = H.owners.filter((n) => !here.has(n));
        const why = this.H.shareWhy(p, H) ?? (missing.length ? `${missing.join(' and ')} ${missing.length > 1 ? 'have' : 'has'} to be playing to say yes.` : null);
        rows.push({
          title: `BUY A SHARE — ${pts(price)}`, right: `${H.owners.length + 1} OWNERS`,
          blurb: `Your colours on the castle, your own statue on the bridge, and its doors open for you. The price is split between ${H.owners.join(' & ')}.`,
          disabled: !!why, why,
          go: () => { this._push(index, { v: 'joinconfirm', site: s.id, price, cursor: 0 }); return null; },
        });
      }
      return { head: s.name, body, rows };
    }
    const c = this.game.inspector.cards[index];
    const look = HOUSES[Math.min(c?.i ?? 0, HOUSES.length - 1)];
    this.H.startPreview(p, s.id, look.id);
    const rows = HOUSES.map((h) => {
      const price = this.H.housePrice(h.id);
      const row = {
        title: h.name, right: pts(price),
        blurb: `${h.blurb}${h.owners > 1 ? ` Up to ${h.owners} sisters can own it together and share the price.` : ''}`,
        go: () => {
          if (h.owners > 1) this._push(index, { v: 'party', site: s.id, house: h.id, with: [] });
          else this._push(index, { v: 'preset', site: s.id, house: h.id, with: [] });
          return null;
        },
      };
      if (mine) Object.assign(row, { disabled: true, why: `${p.name} already has a home — one each! Sell it first.` });
      else if (h.owners <= 1 && p.score < price) Object.assign(row, { disabled: true, why: `${p.name} needs ${pts(price - p.score)} more.` });
      return row;
    });
    return { head: s.name, body, rows, foot: 'JUMP <b>buy this one</b> · INTERACT <b>back</b>' };
  }

  /** The castle: who is buying it with her. */
  _v_party(index, p, top) {
    const price = this.H.housePrice(top.house);
    const others = (this.game.players ?? []).filter((q) => q && q !== p);
    const rows = others.map((q) => {
      const inP = top.with.includes(q.index);
      const has = this.H.homeOf(q);
      return {
        title: `${inP ? '☑' : '☐'} ${q.name}`,
        blurb: has ? 'Already has a home.' : 'Tap to ask her to share the castle.',
        disabled: !!has, why: `${q.name} already has a home — one each!`,
        go: () => {
          if (inP) top.with = top.with.filter((k) => k !== q.index);
          else if (top.with.length < 3) top.with.push(q.index);
          return null;
        },
      };
    });
    const n = top.with.length + 1;
    const share = Math.ceil(price / n / 10) * 10;
    const short = [p, ...top.with.map((k) => this.game.players[k])].filter((q) => q.score < share);
    rows.push({
      title: `NEXT — ${n} OWNER${n > 1 ? 'S' : ''}, ${pts(share)} EACH`,
      disabled: short.length > 0,
      why: short.length ? `${short.map((q) => q.name).join(' and ')} need${short.length > 1 ? '' : 's'} ${pts(share)} each.` : '',
      go: () => { this._push(index, { v: 'preset', site: top.site, house: top.house, with: [...top.with] }); return null; },
    });
    return { head: 'WHO SHARES THE CASTLE?', rows, body: `<div class="pc-dim hs-note">Up to four owners, four colours. The price is shared; each owner decides who may come into her rooms.</div>` };
  }

  /** Furnished, or bare? */
  _v_preset(index, p, top) {
    const base = this.H.housePrice(top.house);
    const n = top.with.length + 1;
    const rows = [{ title: 'BARE HOUSE', right: pts(base), blurb: 'Furnish it yourself, one thing at a time.', preset: null }]
      .concat(PRESETS.map((P) => ({ title: `${P.name} PRESET`, right: pts(base + this.H.price(P.mult)), blurb: P.blurb, preset: P.id })));
    return {
      head: HOUSE_BY_ID[top.house].name,
      rows: rows.map((r) => {
        const total = base + (r.preset ? this.H.price(PRESET_BY_ID[r.preset].mult) : 0);
        const share = Math.ceil(total / n / 10) * 10;
        const short = [p, ...top.with.map((k) => this.game.players[k])].filter((q) => q.score < share);
        return {
          ...r,
          right: n > 1 ? `${pts(share)} each` : r.right,
          disabled: short.length > 0,
          why: `${short.map((q) => q.name).join(' and ')} need${short.length > 1 ? '' : 's'} ${pts(share)}.`,
          go: () => { this._push(index, { v: 'buy', site: top.site, house: top.house, with: top.with, preset: r.preset, share, cursor: 0 }); return null; },
        };
      }),
    };
  }

  /** ARE YOU SURE. No is first, and the cursor opens on it. */
  _v_buy(index, p, top) {
    const s = SITE_BY_ID[top.site];
    const h = HOUSE_BY_ID[top.house];
    return {
      head: 'BUY IT?',
      body: `<div class="hs-note">${esc(h.name)} on ${esc(s.name)}${top.preset ? ` with the ${esc(PRESET_BY_ID[top.preset].name)} preset` : ''} — ${pts(top.share)}${top.with.length ? ' each' : ''}.</div>`,
      rows: [
        { title: 'NO, KEEP LOOKING', go: () => { this._pop(index); return null; } },
        {
          title: `YES, BUY IT FOR ${pts(top.share)}`,
          go: () => {
            if (top.with.length) return this._askOthers(index, { kind: 'buy', ...top });
            return this._doBuy(index, top, [index]);
          },
        },
      ],
    };
  }

  _doBuy(index, top, seats) {
    const buyers = seats.map((k) => ({ p: this.game.players[k], share: top.share }));
    const r = this.H.buy(top.site, top.house, buyers, top.preset);
    if (!r.ok) { this.game.toast(r.why, index); return null; }
    this.H.roshi.say('bought', seats);
    return 'close';
  }

  /** SELL: needs every owner here, and every owner's yes. */
  _v_sell(index, p, top) {
    const H = this.H.store.homes[top.site];
    if (!H) return { head: 'SELL', rows: [{ title: 'NOTHING TO SELL', go: () => null }] };
    const here = new Set((this.game.players ?? []).map((q) => q?.style?.name));
    const missing = H.owners.filter((n) => !here.has(n));
    const back = H.owners.map((n) => `${n}: ${pts((H.paid?.[n] ?? 0) * HOME_SELL)}`).join(' · ');
    return {
      head: 'SELL YOUR HOME?',
      body: `<div class="hs-note">Roshi pays back ${Math.round(HOME_SELL * 100)}%: ${esc(back)}. Everything in it goes too.</div>`,
      rows: [
        { title: 'NO, KEEP MY HOME', go: () => { this._pop(index); return null; } },
        {
          title: 'YES, SELL IT',
          disabled: missing.length > 0,
          why: `Every owner has to be here to sell — ${missing.join(' and ')} ${missing.length > 1 ? 'are' : 'is'} not playing right now.`,
          go: () => {
            if (H.owners.length > 1) {
              const seats = H.owners.map((n) => this.game.players.find((q) => q?.style?.name === n).index);
              return this._askOthers(index, { kind: 'sell', site: top.site, with: seats.filter((k) => k !== index) });
            }
            this.H.sell(top.site);
            this.H.roshi.say('sold', [index]);
            return 'close';
          },
        },
      ],
    };
  }

  /* --------------------- the other owners' consent ---------------------- */

  _askOthers(index, deal) {
    if (this.pending) { this.game.toast('Somebody else is already asking — wait for them to finish.', index); return null; }
    this.pending = { ...deal, driver: index, seats: [index, ...deal.with], yes: new Set([index]) };
    const who = this.game.players[index].name;
    for (const k of deal.with) {
      const c = this.game.inspector.cards[k];
      if (c?.state) this.game.inspector.closeOne(k);
      this.open(k, 'consent', {});
      this._top(k).cursor = 0;
      this.game.toast(`${who} is asking you something — look at your card!`, k);
    }
    this._push(index, { v: 'waiting' });
    return null;
  }

  _v_waiting(index) {
    const P = this.pending;
    const left = P ? P.seats.filter((k) => !P.yes.has(k)).map((k) => this.game.players[k]?.name) : [];
    return { head: 'WAITING…', rows: [{ title: left.length ? `WAITING FOR ${left.join(' AND ')}` : 'DONE', go: () => null }] };
  }

  _v_consent(index) {
    const P = this.pending;
    if (!P) return { head: '', rows: [{ title: 'NEVER MIND', go: () => 'close' }] };
    const who = this.game.players[P.driver]?.name ?? 'Your sister';
    const what = P.kind === 'buy'
      ? `share the ${HOUSE_BY_ID[P.house].name} on ${SITE_BY_ID[P.site].name}, ${pts(P.share)} each`
      : P.kind === 'join'
        ? `buy a share of your home on ${SITE_BY_ID[P.site].name} for ${pts(P.price)}, split between its owners`
        : `sell your shared home on ${SITE_BY_ID[P.site].name}`;
    return {
      head: `${who.toUpperCase()} ASKS`,
      body: `<div class="hs-note">${esc(who)} wants to ${esc(what)}.</div>`,
      rows: [
        { title: P.kind === 'buy' ? 'NO, NOT ME' : P.kind === 'join' ? 'NO, NOT NOW' : 'NO, KEEP OUR HOME', go: () => { this._answer(index, false); return 'close'; } },
        { title: P.kind === 'buy' ? 'YES, COUNT ME IN' : P.kind === 'join' ? `YES, LET ${who.toUpperCase()} IN` : 'YES, SELL IT', go: () => { this._answer(index, true); return 'close'; } },
      ],
    };
  }

  _answer(index, yes) {
    const P = this.pending;
    if (!P || !P.seats.includes(index)) return;
    if (!yes) { this._cancelPending(index, false); return; }
    P.yes.add(index);
    if (P.seats.some((k) => !P.yes.has(k))) return;
    this.pending = null;
    if (P.kind === 'join') {
      const p = this.game.players[P.driver];
      const H = this.H.store.homes[P.site];
      const r = H && p ? this.H.joinHome(p, H) : { ok: false, why: 'That home is not there any more.' };
      for (const k of P.seats) this.game.toast(r.ok ? `${p.name} owns a share of the ${HOUSE_BY_ID[H.house].name} now — welcome home!` : r.why, k);
    } else if (P.kind === 'buy') {
      const r = this.H.buy(P.site, P.house, P.seats.map((k) => ({ p: this.game.players[k], share: P.share })), P.preset);
      if (!r.ok) { for (const k of P.seats) this.game.toast(r.why, k); }
    } else {
      this.H.sell(P.site);
      this.H.roshi.say('sold', P.seats);
    }
    for (const k of P.seats) if (this.game.inspector.extOf(k) === this) this.game.inspector.closeOne(k);
  }

  _cancelPending(index, left) {
    const P = this.pending;
    if (!P) return;
    this.pending = null;
    const who = this.game.players[index]?.name ?? 'Somebody';
    for (const k of P.seats) {
      if (k !== index) this.game.toast(left ? `${who} closed her card — nothing was bought or sold.` : `${who} said no — nothing was bought or sold.`, k);
      if (k !== index && this.game.inspector.extOf(k) === this) {
        const t = this._top(k);
        if (t?.v === 'consent') this.game.inspector.closeOne(k);
        else if (t?.v === 'waiting') this._pop(k);
      }
    }
  }

  /* ------------------------------ HER HOME ------------------------------ */

  _home(top) { return this.H.store.homes[top.site]; }

  _v_home(index, p, top) {
    const H = this._home(top);
    if (!H) return { head: 'HOME', rows: [{ title: 'THIS HOME WAS SOLD', go: () => 'close' }] };
    const n = p.style.name;
    const open = !!H.open?.[n];
    const def = HOUSE_BY_ID[H.house];
    const rows = [
      {
        title: open ? 'LOCK MY DOOR' : 'UNLOCK MY DOOR',
        right: open ? 'OPEN TO VISITORS' : 'LOCKED',
        blurb: open ? 'Anyone can visit. Lock it to keep everyone but the owners out.' : 'Only the owners can come in. Unlock it to invite your sisters.',
        go: () => { this.H.setOpen(p, H, !open); this.game.toast(open ? 'Locked! Only the owners can come in now.' : 'Unlocked! Visitors are welcome.', index); return null; },
      },
      { title: 'FURNISH A ROOM', blurb: 'Furniture on the tatami grid, and kendo or holodeck rooms.', go: () => { this._push(index, { v: 'rooms', site: top.site, here: this.H.isleOf(top.site)?.roomAt?.(p.position.x, p.position.y, p.position.z)?.id ?? null }); return null; } },
      { title: 'THE YARD', blurb: 'Build anywhere on your island — ponds, a farm, a pen, the treehouse, paths and decorations.', go: () => { this._push(index, { v: 'yard', site: top.site }); return null; } },
      { title: 'HOUSES ON MY ISLAND', right: `${houseSpecs(H).length}`, blurb: 'Build more houses, and move any of them — everything inside comes too.', go: () => { this._push(index, { v: 'houses', site: top.site }); return null; } },
      {
        title: 'BRIDGES BETWEEN HOUSES', right: `${(H.links ?? []).length}`, blurb: 'Join two houses door to door, on any floor.',
        disabled: houseSpecs(H).length < 2, why: 'Build a second house first — a bridge joins two.',
        go: () => { this._push(index, { v: 'bridges', site: top.site }); return null; },
      },
      /* NO MUSIC ROW AND NO FILE ROWS. Richard: "Changing the music should be
         done from the boombox at the entrance and exit to the bridge", and the
         .json save/load "shouldn't be in the menu. Let's have that as a Debug
         action for now" — main.js `_debugHousingExport`/`_debugHousingImport`. */
    ];
    /* CLAIMS ONLY WHEN THERE IS SOMEBODY TO SHARE WITH. Richard, Oct 2026:
       "If the player owns the castle solo, there is no point in claiming
       rooms. Let's remove this from the menu." */
    if (H.owners.length > 1 && homeRooms(H).some((r) => r.claim)) {
      rows.push({ title: 'CASTLE ROOMS', blurb: 'Claim your fair share of the rooms, or let one go to pick another.', go: () => { this._push(index, { v: 'claims', site: top.site }); return null; } });
    }
    rows.push(
      { title: 'STORAGE CHEST', blurb: 'Things you have put away.', go: () => { this._push(index, { v: 'chest', site: top.site }); return null; } },
      { title: 'SELL MY HOME', blurb: `Roshi pays back ${Math.round(HOME_SELL * 100)}%.`, go: () => { this._push(index, { v: 'sell', site: top.site, cursor: 0 }); return null; } },
    );
    // a shared castle: one owner can leave it to the others (Housing `leaveHome`)
    if (H.owners.length > 1 && H.owners.includes(n)) {
      rows.push({ title: 'SELL MY SHARE', blurb: `Leave it to ${H.owners.filter((o) => o !== n).join(' & ')}. Roshi pays back ${Math.round(HOME_SELL * 100)}% of what you put in.`, go: () => { this._push(index, { v: 'sellshare', site: top.site, cursor: 0 }); return null; } });
    }
    return { head: `${SITE_BY_ID[top.site].name}`, rows, backWord: 'CLOSE' };
  }

  _v_rooms(index, p, top) {
    const H = this._home(top);
    /* THE ROOM SHE IS STANDING IN COMES FIRST. Richard, Oct 2026: "the first
       room shown to furnish should be the room the player is in already".
       First in the list rather than the cursor moved onto it, so the row
       under the cursor when the card opens IS her room, and it says so. */
    const here = top.here ?? null;
    const rows = roomsListed(H, here).map((room) => {
      const R = H.rooms?.[room.id];
      const claim = R?.claim;
      const notMine = claim && claim !== p.style.name;
      return {
        title: room.id === here ? `${room.name} — YOU ARE HERE` : room.name,
        right: room.mixed && Object.keys(R?.feats ?? {}).length
          ? ['TATAMI', ...ROOM_TYPES.filter((t) => R.feats[t.id] != null).map((t) => t.name)].join(' + ')
          : ROOM_TYPES.find((t) => t.id === (R?.type ?? 'living'))?.name ?? '',
        blurb: `${(R?.items ?? []).length} things${claim ? ` · ${claim}'s room` : ''}`,
        disabled: !!notMine, why: `That is ${claim}'s room — only she can change it.`,
        go: () => { this._push(index, { v: 'room', site: top.site, room: room.id }); return null; },
      };
    });
    return { head: 'WHICH ROOM?', rows };
  }

  _roomDef(H, id) { return roomById(H, id); }

  _v_room(index, p, top) {
    const H = this._home(top);
    const room = this._roomDef(H, top.room);
    H.rooms ??= {};
    const R = (H.rooms[room.id] ??= { type: 'living', items: [] });
    R.items ??= [];
    const rows = [];
    /* A MIXED ROOM HAS FEATURES, NOT A TYPE (catalog `mixed`): a dojo and a
       holodeck can both be added to it, each on its own floor, and the rest
       stays a tatami room. */
    for (const T of room.mixed ? ROOM_TYPES.filter((t) => room.mixed[t.id]) : []) {
      const has = roomHas(R, T.id);
      const price = this.H.roomPrice(T.id);
      rows.push(has ? {
        title: `SELL THE ${T.name}`, right: pts(Math.round((R.feats[T.id] || 0) * ITEM_SELL)),
        blurb: `Roshi buys it back${T.id === 'holodeck' ? ', tubes and racks and all' : ''}. Its floor is tatami again.`,
        go: () => { this._push(index, { v: 'roomfeat', site: top.site, room: room.id, feat: T.id, on: false, cursor: 0 }); return null; },
      } : {
        title: `ADD A ${T.name}`, right: pts(price), blurb: `${T.blurb} On its own part of the floor — the rest stays yours to furnish.`,
        disabled: p.score < price, why: `${p.name} needs ${pts(price - p.score)} more.`,
        go: () => { this._push(index, { v: 'roomfeat', site: top.site, room: room.id, feat: T.id, on: true, cursor: 0 }); return null; },
      });
    }
    for (const T of room.mixed ? [] : ROOM_TYPES) {
      if (T.id === R.type) continue;
      const price = this.H.roomPrice(T.id);
      const ok = !T.need || room[T.need];
      rows.push({
        title: `MAKE IT A ${T.name}`, right: price ? pts(price) : 'FREE', blurb: T.blurb,
        disabled: !ok || p.score < price,
        why: !ok ? `Only a big training hall can be a ${T.name}.` : `${p.name} needs ${pts(price - p.score)} more.`,
        /* ALWAYS ASKS FIRST. Richard: the holodeck "automatically happens
           without a confirmation screen" and threw the furniture away. Now
           every change of room type is a question, and whatever was in the
           room is SOLD BACK at Roshi's price rather than lost. */
        go: () => { this._push(index, { v: 'roomtype', site: top.site, room: room.id, type: T.id, cursor: 0 }); return null; },
      });
    }
    if (R.type === 'living') {
      rows.push({ title: 'ADD FURNITURE', blurb: 'Pick a thing, then put it down where you want it.', go: () => { this._push(index, { v: 'shop', site: top.site, room: room.id, kind: 'room' }); return null; } });
      rows.push({
        title: 'MOVE OR SELL FURNITURE', blurb: 'Point at a thing in the room and pick it up.',
        disabled: !R.items.length, why: 'There is nothing in this room yet.',
        go: () => { this._push(index, { v: 'pick', site: top.site, room: room.id, kind: 'room', at: 0 }); return null; },
      });
      rows.push({
        title: 'ITEM CUSTOMIZATION', blurb: 'Make one thing bigger or smaller, or change how it looks.',
        disabled: !R.items.length, why: 'There is nothing in this room to customize yet.',
        go: () => { this._push(index, { v: 'pick', site: top.site, room: room.id, kind: 'room', at: 0, mode: 'custom' }); return null; },
      });
    }
    if (roomHas(R, 'holodeck')) {
      /* THE KIT, ARRANGED. Richard: "players should be able to place the VR
         Tubes and VR equipment where it fits best in the room ... the 3 pieces
         of VR equipment and 1 tube should be mandatory, but player can place
         up to 4. Placing Tubes and equipment should be free." */
      const tubes = holoTubes(R);
      const spot = tubes < HOLO_MAX_TUBES ? firstFit(roomWith(room, R), R.items, ITEM_BY_ID[HOLO_TUBE_ID]) : null;
      rows.push({
        title: 'MOVE THE TUBES AND THE GEAR', blurb: 'Point at a tube or a rack, pick it up, and put it where it fits best. Free.',
        go: () => { this._push(index, { v: 'pick', site: top.site, room: room.id, kind: 'room', at: 0 }); return null; },
      });
      rows.push({
        title: `ADD ANOTHER TUBE (${tubes} of ${HOLO_MAX_TUBES})`, right: 'FREE',
        blurb: 'One for each of you, so nobody waits for a turn.',
        disabled: !spot,
        why: tubes >= HOLO_MAX_TUBES ? `A holodeck has room for ${HOLO_MAX_TUBES} tubes — that is all of them.` : 'There is no clear floor left for another tube — move the racks closer together first.',
        go: () => { this._push(index, { v: 'build', site: top.site, room: room.id, kind: 'room', sel: -1, id: HOLO_TUBE_ID, ...spot }); return null; },
      });
    }
    const slots = wallSlots(room.house, room).length;
    rows.push({
      title: 'HANG SOMETHING ON THE WALL', blurb: 'Windows, scrolls, pictures and your trophy shelf.',
      disabled: !slots, why: 'This room has no outside wall to hang things on.',
      go: () => { this._push(index, { v: 'shop', site: top.site, room: room.id, kind: 'wall' }); return null; },
    });
    if ((R.wall ?? []).length) {
      rows.push({ title: 'MOVE OR SELL WALL THINGS', go: () => { this._push(index, { v: 'pick', site: top.site, room: room.id, kind: 'wall', at: 0 }); return null; } });
    }
    return { head: room.name, rows };
  }

  /** ADD OR SELL A MIXED ROOM'S DOJO OR HOLODECK? No is first; what moves and what is sold is in the question. */
  _v_roomfeat(index, p, top) {
    const H = this._home(top);
    const room = this._roomDef(H, top.room);
    const R = H.rooms[room.id];
    const T = ROOM_TYPES.find((t) => t.id === top.feat);
    if (!top.on) {
      const back = Math.round((R.feats?.[T.id] || 0) * ITEM_SELL);
      return {
        head: `SELL THE ${T.name}?`,
        body: `<div class="hs-note">${esc(`Roshi pays back ${pts(back)}${T.id === 'holodeck' ? ' — the tubes and the racks go too' : ''}. Its floor becomes tatami you can furnish.`)}</div>`,
        rows: [
          { title: `NO, KEEP THE ${T.name}`, go: () => { this._pop(index); return null; } },
          {
            title: `YES, SELL IT — ${pts(back)}`,
            go: () => {
              const r = setRoomFeat(this.H, p, H, room, R, T.id, false);
              this.game.toast(r.ok ? `The ${T.name} is sold — Roshi paid ${pts(r.back)}.` : r.why, index);
              this._pop(index);
              return null;
            },
          },
        ],
      };
    }
    const price = this.H.roomPrice(T.id);
    const D = displaced(room, R, T.id);
    const what = [
      D.move.length ? `${D.move.length} thing${D.move.length > 1 ? 's' : ''} standing there will move over onto the tatami` : '',
      D.sell.length ? `${D.sell.length} that will not fit anywhere Roshi buys back` : '',
    ].filter(Boolean).join(', and ');
    return {
      head: `ADD A ${T.name}?`,
      body: `<div class="hs-note">${esc(`It costs ${pts(price)}.${what ? ` ${what[0].toUpperCase()}${what.slice(1)}.` : ''}`)}</div>`,
      rows: [
        { title: 'NO, KEEP THE ROOM AS IT IS', go: () => { this._pop(index); return null; } },
        {
          title: `YES, ADD THE ${T.name}`,
          go: () => {
            const r = setRoomFeat(this.H, p, H, room, R, T.id, true);
            if (!r.ok) { this.game.toast(r.why, index); return null; }
            this.game.toast(`The ${room.name} has a ${T.name} now!${T.id === 'holodeck' ? ' Move the tubes and the racks along its dark floor — FREE.' : ''}`, index);
            this._pop(index);
            return null;
          },
        },
      ],
    };
  }

  /** CHANGE THE ROOM? No is first; the furniture's refund is in the question. */
  _v_roomtype(index, p, top) {
    const H = this._home(top);
    const room = this._roomDef(H, top.room);
    const R = H.rooms[room.id];
    const T = ROOM_TYPES.find((t) => t.id === top.type);
    const price = this.H.roomPrice(T.id);
    const refund = roomRefund(this.H, R);
    const typeBack = roomTypeRefund(this.H, R);
    const old = ROOM_TYPES.find((t) => t.id === R.type);
    const n = (R.items ?? []).length;
    // the room's own refund is said out loud, apart from the furniture's
    const what = [
      typeBack ? `the ${old?.name ?? 'room'} for ${pts(typeBack)}` : '',
      n ? `the ${n} thing${n > 1 ? 's' : ''} in it for ${pts(refund - typeBack)}` : '',
    ].filter(Boolean).join(' and ');
    return {
      head: `MAKE IT A ${T.name}?`,
      body: `<div class="hs-note">${what
        ? `Roshi will BUY BACK ${what}.`
        : `The ${esc(room.name)} is empty.`} It costs ${price ? pts(price) : 'nothing'}.</div>`,
      rows: [
        { title: 'NO, KEEP THE ROOM AS IT IS', go: () => { this._pop(index); return null; } },
        {
          title: `YES, MAKE IT A ${T.name}${n ? ' AND SELL THE FURNITURE' : ''}`,
          disabled: p.score + refund < price,
          why: `${p.name} needs ${pts(price - p.score - refund)} more.`,
          go: () => {
            const r = changeRoomType(this.H, p, H, R, T.id, price, room);
            if (!r.ok) { this.game.toast(r.why, index); return null; }
            this.game.toast(`The ${room.name} is now a ${T.name}!${r.refund ? ` Roshi paid ${pts(r.refund)} for ${typeBack ? `the ${old?.name ?? 'room'}${n ? ' and its furniture' : ''}` : 'the furniture'}.` : ''}${T.id === 'holodeck' ? ' Move the tube and the racks wherever you like — FREE.' : ''}`, index);
            this._pop(index);
            return null;
          },
        },
      ],
    };
  }

  /**
   * THE SHOP, for one kind of place: a room's grid, its walls, or the yard
   * (the useful things or the decorations — Richard wanted those on their own
   * shelf). Every row says how many she has (0 included) and stays listed
   * when she cannot afford it, greyed, saying why. The thing under the
   * cursor turns on a little stage at the top (`Preview`).
   */
  _v_shop(index, p, top) {
    const H = this._home(top);
    const I = this.H.isleOf(top.site);
    const room = top.room ? this._roomDef(H, top.room) : null;
    const R = room ? H.rooms[room.id] : null;
    const list = ITEMS.filter((it) => it.where.includes(top.kind === 'wall' ? 'wall' : top.kind === 'yard' ? 'yard' : 'room')
      && (top.kind !== 'yard' || (!!it.path === !!top.path && (it.path || !!it.deco === !!top.deco))));
    const rows = list.map((it) => {
      const price = this.H.itemPrice(it.id);
      let spot = null;
      if (top.kind === 'room') spot = firstFit(roomWith(room, R), R.items, it);
      else if (top.kind === 'wall') {
        const S = wallSlots(room.house, room).find((s) => wallFree(R, s.side, s.k) && !buildWhy(H, { kind: 'wall', room: room.id, id: it.id, side: s.side, k: s.k, sel: -1 }));
        spot = S && { side: S.side, k: S.k };
      } else spot = firstYardSpot(H, it, I?.radius ?? 50);
      /* THE NEXT ONE STARTS WHERE THE LAST ONE WENT. Richard, Oct 2026: "after
         placing an object outside, the next placement should start where the
         previous one was placed. Backing out or reopening the menu resets to
         the default." `lastPut` lives in this opening of the menu (`open`
         makes a fresh one) and `_pop` drops it on a back-out. The drop still
         asks `yardWhy`, so starting on top of the last thing only means the
         first nudge of the stick is to one side of it. */
      const last = this.st.get(index)?.lastPut;
      if (top.kind === 'yard' && last && !it.later) spot = { x: last.x, z: last.z, rot: last.rot };
      /* NO SPOT FOUND IS NOT "NO ROOM". The search is a grid and she has eyes:
         a yard thing with nowhere found for it still goes into build mode,
         behind the house, and the drop says exactly what is in the way
         (`yardWhy`) wherever she tries it. Richard: "it says there is not
         enough room, but seems there is plenty of room." */
      const loose = !spot && top.kind === 'yard';
      if (loose) spot = { x: 0, z: -Math.round((I?.radius ?? 50) * 0.55), rot: 0 };
      return {
        title: it.later ? `${it.name} — COMING LATER` : it.name,
        right: it.later ? 'LOCKED' : pts(price),
        blurb: `YOU HAVE ${ownedCount(H, it.id)}${loose ? ' · NO FREE SPOT FOUND — carry it to one.' : ''}${it.blurb ? ` · ${it.blurb}` : top.kind === 'room' ? ` · ${footprint(it).join('×')} tatami.` : ''}`,
        disabled: it.later || !spot || p.score < price,
        why: it.later ? 'Coming in a later update!'
          : !spot ? (top.kind === 'wall' ? 'Every wall here is full.' : 'There is no room left for that here.')
            : `${p.name} needs ${pts(price - p.score)} more.`,
        item: it.id,
        go: () => { this._push(index, { v: 'build', site: top.site, room: top.room, kind: top.kind, sel: -1, id: it.id, rot: 0, ...spot }); return null; },
      };
    });
    const c = this.game.inspector.cards[index];
    this._previewSite = top.site;
    this.preview.show(index, rows[Math.min(c?.i ?? 0, rows.length - 1)]?.item);
    const head = top.kind === 'wall' ? 'FOR THE WALLS' : top.kind === 'yard' ? (top.path ? 'WALKING PATHS' : top.deco ? 'DECORATIONS' : 'FOR THE YARD') : 'ADD FURNITURE';
    return { head, body: '<canvas class="hs-prev" width="200" height="140"></canvas>', rows };
  }

  /**
   * BUILD MODE'S CARD — small, at the bottom, see-through, so the world is
   * the thing she is looking at. The corner map, the key legend, and what is
   * wrong if it is red. The pad is `BuildMode.drive`'s; these rows are for a
   * finger (a tap on PUT IT HERE), and for a phone the four keys are buttons.
   */
  _v_build(index, p, top) {
    if (top.kind === 'house') return this._v_buildhouse(index, p, top);
    if (top.kind === 'link') return this._v_buildlink(index, p, top);
    const H = this._home(top);
    const I = this.H.isleOf(top.site);
    const it = ITEM_BY_ID[top.id];
    const bad = buildWhy(H, top, I?.radius ?? 50);
    const price = top.sel < 0 ? this.H.itemPrice(it.id) : 0;
    const touch = this._touch();
    const rows = [{
      title: top.sel < 0 ? `PUT IT HERE — ${price ? pts(price) : 'FREE'}` : 'PUT IT HERE',
      disabled: !!bad || p.score < price,
      why: bad ?? `${p.name} needs ${pts(price - p.score)} more.`,
      go: () => { this.placeHere(index, top); return null; },
    }];
    if (top.sel >= 0) rows.push({ title: it.holo ? 'TAKE IT OUT' : `SELL IT BACK — ${pts(this._sellBack(it.id))}`, go: () => { this.askSell(index, top); return null; } });
    const keys = this._stepKeys(top, BUILD_KEYS.filter(([, w]) => w !== 'sell' || top.sel >= 0).filter(([, w]) => w !== 'turn' || top.kind !== 'wall'));
    return {
      build: true,
      head: it.name,
      body: `<div class="hs-buildrow"><canvas class="hs-map" width="180" height="180"></canvas><div class="hs-buildinfo">
        <div class="${bad ? 'hs-bad' : 'hs-good'}">${esc(bad ?? (top.sel < 0 ? 'It fits! Press JUMP to put it here.' : 'It fits here.'))}</div>
        <div class="hs-keys">${keys.map(([k, w]) => `<span><b>${k}</b> ${w}</span>`).join('')}</div>
        ${touch ? this._touchPad(index, top.kind !== 'wall', top.sel >= 0, freeTurn(top) && rotStepOf(top)) : ''}</div></div>`,
      rows,
      foot: ' ',
    };
  }

  /** The legend's RIDE row says the step she has NOW; gone where there is none. */
  _stepKeys(top, keys) {
    return keys.filter(([k]) => k !== 'RIDE' || freeTurn(top)).map(([k, w]) => (k === 'RIDE' ? [k, `turn by ${rotStepOf(top)}°`] : [k, w]));
  }

  /** THE SELECTOR: a ring on one of her things; the stick hops it. */
  _v_pick(index, p, top) {
    const H = this._home(top);
    const L = pickList(H, top.kind, top.room);
    if (!L.length) return { head: 'NOTHING HERE', rows: [{ title: 'BACK', go: () => { this._pop(index); return null; } }] };
    if (top.kind === 'house' || top.kind === 'link') return this._v_pickbig(index, p, top, H, L);
    top.at = Math.min(top.at ?? 0, L.length - 1);
    const q = L[top.at];
    const it = ITEM_BY_ID[q.id];
    const touch = this._touch();
    const why = this._noCustom(top.kind, q.id);
    const custom = { title: 'CUSTOMIZE IT', blurb: 'Bigger, smaller, or another look.', disabled: !!why, why, go: () => { this.customize(index, top); return null; } };
    const keys = top.mode === 'custom' ? CUSTOM_PICK_KEYS : PICK_KEYS;
    return {
      build: true,
      head: `${it?.name ?? q.id}  (${top.at + 1} of ${L.length})`,
      body: `<div class="hs-buildrow"><canvas class="hs-map" width="180" height="180"></canvas><div class="hs-buildinfo">
        <div class="${why && top.mode === 'custom' ? 'hs-bad' : 'hs-good'}">${esc(why && top.mode === 'custom' ? why : 'The ring shows which one. Move the stick to point at another.')}</div>
        <div class="hs-keys">${keys.map(([k, w]) => `<span><b>${k}</b> ${w}</span>`).join('')}</div>
        ${touch ? `<div class="hs-pad">${['left', 'up', 'down', 'right'].map((d) => `<button type="button" data-hact="${d}" data-side="${index}">${ARROW[d]}</button>`).join('')}</div>` : ''}</div></div>`,
      rows: top.mode === 'custom' ? [custom] : [
        { title: 'PICK IT UP AND MOVE IT', go: () => { this.pickUp(index, top); return null; } },
        custom,
        { title: it?.holo ? 'TAKE IT OUT' : `SELL IT BACK — ${pts(this._sellBack(q.id))}`, go: () => { this.askSell(index, top); return null; } },
      ],
      foot: ' ',
    };
  }

  /* ------------------------- ITEM CUSTOMIZATION ------------------------- */

  /**
   * Why this thing cannot be customised, or null. Wall things hang in a slot
   * of a fixed size, and the yard's BUILT things (the ponds, the court, the
   * pen, the treehouse) are levels with colliders and animals measured to
   * them — resizing one would move a fence the goats are inside.
   */
  _noCustom(kind, id) {
    if (kind === 'wall') return 'Wall things fit their space on the wall — they cannot be resized.';
    if (ITEM_BY_ID[id]?.holo) return 'The holodeck\'s kit is the arcade\'s own — it can be moved, not customized.';
    /* EXCEPT THE DOOR MAT. It is a path piece, so it is in YARD_BUILT, but
       its look is only which design off the sheet it wears — nothing it
       touches is measured to it. Richard, Oct 2026: "Door mats ... should be
       customizable ... at least to change the pattern on it." Its card has
       the LOOK rows and not the SIZE ones (`_v_custom`). */
    if (kind === 'yard' && YARD_BUILT.has(id) && !ITEM_BY_ID[id]?.mat) return 'This one is built into the island — it cannot be customized.';
    return null;
  }

  /** JUMP (custom mode) or ATTACK on the selector: customise the one under the ring. */
  customize(index, top) {
    const H = this._home(top);
    const q = pickList(H, top.kind, top.room)[top.at ?? 0];
    if (!q) return;
    const why = this._noCustom(top.kind, q.id);
    if (why) { this.game.toast(why, index); this.game.audio?.play?.('menu'); return; }
    this._push(index, { v: 'custom', site: top.site, room: top.room, kind: top.kind, sel: q.k, cursor: 0 });
    this.game.audio?.play?.('menu');
  }

  _customRow(H, top) {
    return top.kind === 'yard' ? H.outdoor?.[top.sel] : H.rooms?.[top.room]?.items?.[top.sel];
  }

  /**
   * ONE THING, MADE HERS. Richard, Oct 2026: "We should have a way for the
   * player to customize the items to change their scale and how they look
   * ... Especially if it is a Polyfork item ... Customizations should also be
   * saved with the house in the json file ... While customizing the item, the
   * camera should be focused on it ... We should limit the customization so
   * that player can't go too crazy with it, like having it go through the
   * roof."
   *
   *   SIZE   half to half again (LOOK_MUL), and never past the box `fitTo`
   *          measures it into — under the ceiling and inside its own tatami
   *          for a room thing. BIGGER greys out AT the limit and says which.
   *   LOOK   a Polyfork model's own colourways (MODEL_STYLES, read off its
   *          params), or a lacquer for a drawn thing (TINTS).
   *
   * Every press is applied at once and saved with the house (`row.look`, in
   * the home row and its JSON); the camera is on the thing (build.js
   * `frameOf`), so she sees the result as she makes it.
   */
  _v_custom(index, p, top) {
    const H = this._home(top);
    const row = this._customRow(H, top);
    const it = ITEM_BY_ID[row?.id];
    if (!row || !it) return { head: 'NOTHING HERE', rows: [{ title: 'BACK', go: () => { this._pop(index); return null; } }] };
    const I = this.H.isleOf(top.site);
    const mesh = I?.itemMeshes?.get(top.kind === 'yard' ? 'o' + row.uid : `r:${top.room}:${top.sel}`);
    const s = row.look?.s ?? 1;
    const max = Math.min(LOOK_MUL.max, mesh?.userData.maxMul ?? LOOK_MUL.max);
    const shown = Math.min(s, max);
    // a door mat's looks are its designs on the one sheet (catalog.js DOOR_MATS)
    const styles = it.mat ? DOOR_MATS.map((m) => ({ id: m.id, name: m.name })) : stylesFor(it.model);
    const cur = Math.max(0, styles.findIndex((x) => x.id === row.look?.style));
    const set = (look) => {
      const L = { ...(row.look ?? {}), ...look };
      if (L.s != null && Math.abs(L.s - 1) < 1e-6) delete L.s;
      if (L.style === styles[0]?.id || !L.style) delete L.style;
      if (Object.keys(L).length) row.look = L; else delete row.look;
      top.rev = (top.rev ?? 0) + 1;
      this.H.changed(H);
      this.game.audio?.play?.('menu');
      return null;
    };
    const step = LOOK_MUL.step;
    const r1 = (v) => Math.round(v * 10) / 10;
    const ceilingWhy = top.kind === 'room' ? 'Any bigger and it would go through the ceiling or into the walls.' : 'That is as big as it goes.';
    const style = styles[cur];
    return {
      head: `CUSTOMIZE: ${it.name}`,
      body: it.mat
        ? `<div class="hs-note">PATTERN: ${esc(style?.name ?? 'AS IT CAME')} · ${cur + 1} of ${styles.length}</div>`
        : `<div class="hs-note">SIZE ${Math.round(shown * 100)}% · LOOK: ${esc(style?.name ?? 'AS IT CAME')}${it.model ? ' · a Polyfork model' : ''}</div>`,
      rows: [
        // a door mat lies where the path put it, so it keeps its size: only its pattern changes
        ...(it.mat ? [] : [{
          title: 'BIGGER', right: `${Math.round(shown * 100)}%`,
          disabled: shown + step > max + 1e-6, why: shown + step > LOOK_MUL.max + 1e-6 ? 'That is as big as it goes.' : ceilingWhy,
          go: () => set({ s: r1(Math.min(max, shown + step)) }),
        },
        {
          title: 'SMALLER', right: `${Math.round(shown * 100)}%`,
          disabled: shown - step < LOOK_MUL.min - 1e-6, why: 'That is as small as it goes.',
          go: () => set({ s: r1(Math.max(LOOK_MUL.min, shown - step)) }),
        }]),
        {
          title: `NEXT LOOK: ${styles[(cur + 1) % styles.length]?.name ?? ''}`, right: `${cur + 1} of ${styles.length}`,
          disabled: styles.length < 2, why: 'This one only comes one way.',
          go: () => set({ style: styles[(cur + 1) % styles.length].id }),
        },
        {
          title: `LAST LOOK: ${styles[(cur + styles.length - 1) % styles.length]?.name ?? ''}`,
          disabled: styles.length < 2, why: 'This one only comes one way.',
          go: () => set({ style: styles[(cur + styles.length - 1) % styles.length].id }),
        },
        {
          title: 'PUT IT BACK HOW IT CAME',
          disabled: !row.look, why: 'It is already how it came.',
          go: () => { delete row.look; return set({}); },
        },
        { title: 'DONE', go: () => { this._pop(index); return null; } },
      ],
    };
  }

  _touch() {
    return !!(this.game.touchUI ?? (typeof document !== 'undefined' && document.body.classList.contains('touch-ui')));
  }

  _touchPad(index, turn, sell, step = 0) {
    const b = (act, label) => `<button type="button" data-hact="${act}" data-side="${index}">${label}</button>`;
    // `step` is the RIDE button: a number of degrees, or (a bridge's) its own word
    return `<div class="hs-pad">${['left', 'up', 'down', 'right'].map((d) => b(d, ARROW[d])).join('')}${turn ? b('rot', '⟳') : ''}${step ? b('step', typeof step === 'string' ? step : `${step}°`) : ''}${sell ? b('sell', 'SELL') : ''}</div>`;
  }

  _sellBack(id) { return Math.round(this.H.itemPrice(id) * ITEM_SELL); }

  /** From the selector into build mode, holding the one under the ring. */
  pickUp(index, top) {
    const H = this._home(top);
    const L = pickList(H, top.kind, top.room);
    const q = L[top.at ?? 0];
    if (!q) return;
    if (top.kind === 'link') { this.game.toast('A bridge cannot be moved — sell it and build another.', index); return; }
    if (top.kind === 'house') {
      this._push(index, { v: 'build', site: top.site, kind: 'house', sel: q.hk, id: q.id, x: q.x, z: q.z, rot: q.rot ?? 0 });
      this.game.audio?.play?.('menu');
      return;
    }
    const row = top.kind === 'yard' ? H.outdoor[q.k] : top.kind === 'wall' ? H.rooms[top.room].wall[q.k] : H.rooms[top.room].items[q.k];
    const v = { v: 'build', site: top.site, room: top.room, kind: top.kind, sel: q.k, id: row.id };
    if (top.kind === 'yard') Object.assign(v, { x: row.x, z: row.z, rot: row.rot ?? 0 });
    else if (top.kind === 'wall') Object.assign(v, { side: row.side, k: row.k });
    else Object.assign(v, { gx: row.gx, gz: row.gz, rot: row.rot ?? 0 });
    this._push(index, v);
    this.game.audio?.play?.('menu');
  }

  /** JUMP in build mode, or a tap on PUT IT HERE. Refuses out loud. */
  placeHere(index, top) {
    const p = this.game.players[index];
    const H = this._home(top);
    const I = this.H.isleOf(top.site);
    if (top.kind === 'house') {
      const isNew = top.sel === -1;
      if (!this.H.placeHouse(p, H, { hk: isNew ? null : top.sel, house: top.id, x: top.x, z: top.z, rot: top.rot ?? 0 })) return;
      this._pop(index);
      /* WATCH IT GO UP. Richard, Oct 2026: "the camera should go to the front
         of the door and show the house being built, with menu selection
         temporarily disabled. The camera then returns to the player." The
         house is already written down; this view only holds her card still
         (`drive` takes the whole pad) while `Builder.camera` frames the door,
         and steps back by itself when the rise is done. START still closes
         the card, as it does on every card. */
      if (isNew) this._push(index, { v: 'raising', site: top.site, hk: `a${H.uid}`, id: top.id, t: 0, dur: RAISE_T + RAISE_HOLD });
      return;
    }
    if (top.kind === 'link') return this._linkHere(index, p, H, top);
    const it = ITEM_BY_ID[top.id];
    const bad = buildWhy(H, top, I?.radius ?? 50);
    if (bad) { this.game.toast(bad, index); this.game.audio?.play?.('menu'); return; }
    const price = top.sel < 0 ? this.H.itemPrice(it.id) : 0;
    if (price && !this.H.spend(p, H, price)) { this.game.toast(`${p.name} needs ${pts(price - p.score)} more.`, index); return; }
    commitBuild(H, top);
    this.H.changed(H);
    top.placed = true;
    if (top.kind === 'yard') this.st.get(index).lastPut = { x: top.x, z: top.z, rot: top.rot ?? 0 };
    this.game.audio?.play?.('land');
    this.game.toast(top.sel < 0 ? `The ${it.name} is in!` : `Moved the ${it.name}.`, index);
    this._pop(index);
  }

  /** SPRINT in build or pick mode: the "are you sure", if there is a thing to sell. */
  askSell(index, top) {
    if (top.kind === 'house') {
      const hk = top.v === 'pick' ? pickList(this._home(top), 'house')[top.at ?? 0]?.hk : top.sel;
      if (!hk || hk === -1) { this.game.toast('That is not built yet — there is nothing to sell back.', index); return; }
      if (hk === 'main') { this.game.toast('Your first house goes with the island — sell the whole home at Roshi\'s to sell it.', index); return; }
      this._push(index, { v: 'sellhouse', site: top.site, hk, cursor: 0 });
      return;
    }
    if (top.kind === 'link') {
      if (top.v !== 'pick') { this.linkBack(index, top); return; }
      const uid = pickList(this._home(top), 'link')[top.at ?? 0]?.uid;
      if (uid != null) this._push(index, { v: 'selllink', site: top.site, uid, cursor: 0 });
      return;
    }
    let sel = top.sel;
    if (top.v === 'pick') sel = pickList(this._home(top), top.kind, top.room)[top.at ?? 0]?.k ?? -1;
    if (sel == null || sel < 0) { this.game.toast('That is not yours yet — there is nothing to sell back.', index); return; }
    const keep = top.kind === 'room' && holoWhyRemove(this._home(top).rooms?.[top.room], sel);
    if (keep) { this.game.toast(keep, index); this.game.audio?.play?.('menu'); return; }
    this._push(index, { v: 'sellitem', site: top.site, room: top.room, kind: top.kind, sel, cursor: 0 });
  }

  _v_sellitem(index, p, top) {
    const H = this._home(top);
    const list = top.kind === 'yard' ? H.outdoor : top.kind === 'wall' ? H.rooms?.[top.room]?.wall : H.rooms?.[top.room]?.items;
    const q = list?.[top.sel];
    const it = ITEM_BY_ID[q?.id];
    // a window that came with the house was free, and sells for what it cost
    const back = q?.free ? 0 : this._sellBack(it?.id);
    return {
      head: 'SELL IT BACK?',
      body: q?.id === 'pen' || q?.id === 'koipond' ? '<div class="hs-note">The animals and the koi wait for you — build it again and they come back.</div>' : '',
      rows: [
        { title: `NO, KEEP THE ${it?.name ?? 'THING'}`, go: () => { this._pop(index); return null; } },
        {
          title: it?.holo ? `YES, TAKE THE ${it.name} OUT` : `YES, SELL IT FOR ${pts(back)}`,
          go: () => {
            if (!removeBuilt(H, top.kind, top.room, top.sel)) return null;
            p.score += back;
            const n = p.style?.name;
            if (n && H.paid) H.paid[n] = Math.max(0, (H.paid[n] ?? 0) - back);
            this.game.onScoreChanged?.(p);
            this.H.changed(H);
            this.game.toast(it?.holo ? `The ${it.name} is out — add it back any time, free.` : `Roshi paid ${pts(back)} for the ${it?.name ?? 'thing'}.`, index);
            // out of the question and out of the build/pick view it came from
            this._pop(index); this._pop(index);
            return null;
          },
        },
      ],
    };
  }

  _v_yard(index, p, top) {
    const H = this._home(top);
    return {
      head: 'THE YARD',
      rows: [
        { title: 'BUILD SOMETHING', blurb: 'Ponds, the onsen, the farm, the pen, the treehouse — put them anywhere on your island.', go: () => { this._push(index, { v: 'shop', site: top.site, kind: 'yard', deco: false }); return null; } },
        { title: 'DECORATIONS', blurb: 'Cheap and pretty: trees, lanterns, fences, stones. Anywhere outside.', go: () => { this._push(index, { v: 'shop', site: top.site, kind: 'yard', deco: true }); return null; } },
        { title: 'WALKING PATHS', blurb: 'Stepping stones to a red carpet with tiki torches. Lay them end to end, turn them, cross them.', go: () => { this._push(index, { v: 'shop', site: top.site, kind: 'yard', path: true }); return null; } },
        {
          title: 'MOVE OR SELL', blurb: 'Point at something outside and pick it up.',
          disabled: !(H.outdoor ?? []).length, why: 'There is nothing in the yard yet.',
          go: () => { this._push(index, { v: 'pick', site: top.site, kind: 'yard', at: 0 }); return null; },
        },
        {
          title: 'ITEM CUSTOMIZATION', blurb: 'Make a tree, a lantern or a bench bigger or smaller, or change how it looks.',
          disabled: !(H.outdoor ?? []).length, why: 'There is nothing in the yard to customize yet.',
          go: () => { this._push(index, { v: 'pick', site: top.site, kind: 'yard', at: 0, mode: 'custom' }); return null; },
        },
      ],
    };
  }

  _v_claims(index, p, top) {
    const H = this._home(top);
    const def = { rooms: homeRooms(H) };
    // (the rules and every refusal are Housing's: `claimWhy`, `setClaim`)
    const me = p.style.name;
    const share = this.H.claimShare(H);
    const mine = this.H.claimsOf(H, me).length;
    const rows = def.rooms.filter((r) => r.claim).map((room) => {
      const who = H.rooms?.[room.id]?.claim;
      if (who === me) {
        return {
          title: `LET GO OF THE ${room.name}`, right: 'YOURS',
          blurb: 'It is yours. Let it go and it is UNCLAIMED again — for you or a sister to pick.',
          go: () => { if (this.H.setClaim(p, H, room.id, false)) this.game.toast(`${me} lets the ${room.name} go — anybody can claim it now.`, index); return null; },
        };
      }
      const why = this.H.claimWhy(p, H, room.id);
      return {
        title: who ? room.name : `CLAIM THE ${room.name}`, right: who ? possessive(who) : 'UNCLAIMED',
        blurb: who ? `${who} claimed it.` : room.through
          ? 'Make it yours: only you can furnish it. Everybody walks through it to the door or the stairs, so it is never locked.'
          : 'Make it yours: only you can furnish it, and your door lock keeps others out.',
        disabled: !!why, why,
        go: () => { if (this.H.setClaim(p, H, room.id, true)) this.game.toast(`The ${room.name} is ${me}'s now!`, index); return null; },
      };
    });
    const left = Math.max(0, share - mine);
    const owners = H.owners.length;
    const spare = def.rooms.filter((r) => r.claim).length - share * owners;
    return {
      head: 'CASTLE ROOMS',
      body: `<div class="pc-dim">${esc(`A fair share is ${share} room${share === 1 ? '' : 's'} each for ${owners} owner${owners === 1 ? '' : 's'} — you can claim ${left} more.${spare > 0 ? ` ${spare === 1 ? 'One room is' : `${spare} rooms are`} left over for everybody to share.` : ''}`)}</div>`,
      rows,
    };
  }

  /* ------------------------- HOUSES AND BRIDGES -------------------------- */

  /**
   * HOUSES ON HER ISLAND. Richard: "an option in the menu at their house that
   * allows them to buy and place more houses on the island ... the first
   * house is free that comes with the island, after that they have to buy
   * any additional houses they build."
   */
  _v_houses(index, p, top) {
    const H = this._home(top);
    const n = houseSpecs(H).length;
    return {
      head: 'HOUSES ON MY ISLAND',
      rows: [
        { title: 'BUILD A HOUSE', blurb: FREE_ANNEX[H.house] && !(H.annex ?? []).some((a) => a.free) ? `Your ${HOUSE_BY_ID[FREE_ANNEX[H.house]].name} is FREE — it came with the island.` : 'Pick one, then put it where you want it.', go: () => { this._push(index, { v: 'houseshop', site: top.site }); return null; } },
        { title: 'MOVE A HOUSE', blurb: 'Pick one up — the furniture inside goes with it, and the camera at your name board follows.', go: () => { this._push(index, { v: 'pick', site: top.site, kind: 'house', at: 0 }); return null; } },
        {
          title: 'SELL A HOUSE', blurb: 'Roshi buys back an extra house with everything in it. Your first house goes with the island.',
          disabled: n < 2, why: 'You only have your first house — it goes with the island.',
          go: () => { this._push(index, { v: 'pick', site: top.site, kind: 'house', at: Math.min(1, n - 1) }); return null; },
        },
      ],
    };
  }

  _v_houseshop(index, p, top) {
    const H = this._home(top);
    const I = this.H.isleOf(top.site);
    const env = this.H.envOf(I);
    const rows = BUILDABLE_HOUSES.map((id) => {
      const def = HOUSE_BY_ID[id];
      const price = this.H.annexPrice(H, id);
      const spot = this._houseSpot(H, id, env);
      return {
        title: def.name, right: price ? pts(price) : 'FREE',
        blurb: `${def.floors} floor${def.floors > 1 ? 's' : ''} · ${def.rooms.length} room${def.rooms.length > 1 ? 's' : ''}${price ? ` · half price, it's your island (${pts(this.H.housePrice(id))} at Roshi's)` : ' · it came with your island'}`,
        disabled: !spot || p.score < price,
        why: !spot ? 'There is no room left on the island for that one.' : `${p.name} needs ${pts(price - p.score)} more.`,
        go: () => { this._push(index, { v: 'build', site: top.site, kind: 'house', sel: -1, id, ...spot }); return null; },
      };
    });
    return { head: 'BUILD A HOUSE', rows };
  }

  /** The first place on the island a house fits, back first, facing the middle. */
  _houseSpot(H, id, env) {
    const R = env.r ?? 50;
    for (let d = 10; d < R; d += 2) {
      const n = Math.max(8, Math.round(d * 0.6));
      for (let k = 0; k < n; k++) {
        const s = k % 2 ? 1 : -1;
        const a = Math.PI + s * Math.ceil(k / 2) * (Math.PI * 2 / n);
        const x = +(Math.sin(a) * d).toFixed(2), z = +(Math.cos(a) * d).toFixed(2);
        // its front faces the island's middle: rot is the angle from +z to (-x, -z)
        const rot = Math.round(Math.atan2(-x, -z) / (Math.PI / 4)) * (Math.PI / 4);
        if (!houseWhy(H, { hk: null, house: id, x, z, rot }, env)) return { x, z, rot };
      }
    }
    return null;
  }

  _v_buildhouse(index, p, top) {
    const H = this._home(top);
    const I = this.H.isleOf(top.site);
    const def = HOUSE_BY_ID[top.id];
    const bad = buildWhy(H, top, this.H.envOf(I));
    const isNew = top.sel === -1;
    const price = isNew ? this.H.annexPrice(H, top.id) : 0;
    const touch = this._touch();
    const rows = [{
      title: isNew ? `BUILD IT HERE — ${price ? pts(price) : 'FREE'}` : 'PUT IT HERE',
      disabled: !!bad || p.score < price,
      why: bad ?? `${p.name} needs ${pts(price - p.score)} more.`,
      go: () => { this.placeHere(index, top); return null; },
    }];
    if (!isNew && top.sel !== 'main') rows.push({ title: `SELL IT BACK — ${pts(this.H.annexRefund(H, top.sel))}`, go: () => { this.askSell(index, top); return null; } });
    const keys = this._stepKeys(top, BUILD_KEYS.filter(([, w]) => w !== 'sell' || (!isNew && top.sel !== 'main')));
    return {
      build: true,
      head: def.name,
      body: `<div class="hs-buildrow"><canvas class="hs-map" width="180" height="180"></canvas><div class="hs-buildinfo">
        <div class="${bad ? 'hs-bad' : 'hs-good'}">${esc(bad ?? (isNew ? 'It fits! Press JUMP to build it here.' : 'It fits here — everything inside comes with it.'))}</div>
        <div class="hs-keys">${keys.map(([k, w]) => `<span><b>${k}</b> ${w}</span>`).join('')}</div>
        ${touch ? this._touchPad(index, true, !isNew && top.sel !== 'main', rotStepOf(top)) : ''}</div></div>`,
      rows,
      foot: ' ',
    };
  }

  /**
   * SOMEBODY IS KNOCKING (`Housing.knock`): the owner's question, NO first and
   * no `.primary` (non-negotiable 7). Closing it unanswered is a NO (`closed`).
   */
  _v_knock(index, p, top) {
    const who = this.game.players[top.visitor]?.name ?? 'Somebody';
    const done = (yes) => () => { top.answered = true; this.H.answerKnock(p, top, yes); return 'close'; };
    return {
      head: `${who.toUpperCase()} IS KNOCKING`,
      body: `<div class="hs-note">${esc(`${who} is knocking at your door. Open it for ${who}?`)}</div>`,
      rows: [
        { title: 'NO, KEEP IT SHUT', go: done(false) },
        { title: `YES, LET ${who.toUpperCase()} IN`, go: done(true) },
      ],
    };
  }

  /**
   * AT THE TOP OF THE SLIDE (sliderider.js). Richard: "Ride down in normal
   * view" and "Ride down in First Person View". Staying is first and is the
   * one that does nothing, like every question here.
   */
  _v_slide(index, p) {
    const go = (fpv) => () => (this.H.slides.start(p, fpv) ? 'close' : null);
    return {
      head: 'THE SLIDE',
      body: `<div class="hs-note">${esc('All the way down, round and round the pole! How do you want to ride it?')}</div>`,
      rows: [
        { title: 'NO, STAY UP HERE', go: () => 'close' },
        { title: 'RIDE DOWN IN NORMAL VIEW', go: go(false) },
        { title: 'RIDE DOWN IN FIRST PERSON VIEW', go: go(true) },
      ],
    };
  }

  /** A new house going up (`placeHere`): nothing to choose, only to watch. */
  _v_raising(index, p, top) {
    const def = HOUSE_BY_ID[top.id];
    return {
      head: def?.name ?? 'HOUSE',
      body: '<div class="hs-good">It is going up — watch!</div>',
      rows: [],
      foot: ' ',
      backWord: 'WAIT',
    };
  }

  /** The selector over houses or bridges: a house moves or sells, a bridge sells. */
  _v_pickbig(index, p, top, H, L) {
    top.at = Math.min(top.at ?? 0, L.length - 1);
    const q = L[top.at];
    const touch = this._touch();
    const house = top.kind === 'house';
    const name = house ? `${HOUSE_BY_ID[q.id].name}${q.hk === 'main' ? ' (YOUR FIRST)' : ''}` : LINK_BY_ID[q.id]?.name ?? 'BRIDGE';
    const rows = house ? [
      { title: 'PICK IT UP AND MOVE IT', go: () => { this.pickUp(index, top); return null; } },
      {
        title: q.hk === 'main' ? 'SELL IT BACK' : `SELL IT BACK — ${pts(this.H.annexRefund(H, q.hk))}`,
        disabled: q.hk === 'main', why: 'Your first house goes with the island — sell the whole home to sell it.',
        go: () => { this.askSell(index, top); return null; },
      },
    ] : [
      { title: `SELL IT BACK — ${pts(Math.round((H.links.find((x) => x.uid === q.uid)?.paid ?? 0) * HOME_SELL))}`, go: () => { this.askSell(index, top); return null; } },
    ];
    const keys = house ? PICK_KEYS.filter(([, w]) => w !== 'customize') : [['STICK', 'choose'], ['SPRINT', 'sell'], ['INTERACT', 'back']];
    return {
      build: true,
      head: `${name}  (${top.at + 1} of ${L.length})`,
      body: `<div class="hs-buildrow"><canvas class="hs-map" width="180" height="180"></canvas><div class="hs-buildinfo">
        <div class="hs-good">The ring shows which one. Move the stick to point at another.</div>
        <div class="hs-keys">${keys.map(([k, w]) => `<span><b>${k}</b> ${w}</span>`).join('')}</div>
        ${touch ? `<div class="hs-pad">${['left', 'up', 'down', 'right'].map((d) => `<button type="button" data-hact="${d}" data-side="${index}">${ARROW[d]}</button>`).join('')}</div>` : ''}</div></div>`,
      rows,
      foot: ' ',
    };
  }

  _v_sellhouse(index, p, top) {
    const H = this._home(top);
    const a = (H.annex ?? []).find((x) => `a${x.uid}` === top.hk);
    const def = HOUSE_BY_ID[a?.house];
    const back = this.H.annexRefund(H, top.hk);
    const nl = (H.links ?? []).filter((L) => L.a.hk === top.hk || L.b.hk === top.hk).length;
    return {
      head: 'SELL THIS HOUSE?',
      body: `<div class="hs-note">${esc(`Everything inside it is sold too${nl ? `, and ${nl === 1 ? 'the bridge' : `the ${nl} bridges`} to it` : ''}. Roshi pays ${pts(back)}.`)}</div>`,
      rows: [
        { title: `NO, KEEP THE ${def?.name ?? 'HOUSE'}`, go: () => { this._pop(index); return null; } },
        {
          title: `YES, SELL IT FOR ${pts(back)}`,
          go: () => {
            const n = this.H.sellHouse(p, H, top.hk);
            if (n === false) return null;
            this.game.toast(`Roshi paid ${pts(n)} for the ${def?.name ?? 'house'}.`, index);
            this._pop(index); this._pop(index);
            return null;
          },
        },
      ],
    };
  }

  /** BRIDGES. Richard: "different types of bridges, some more generic and some more elaborate and decorative and fanciful." */
  _v_bridges(index, p, top) {
    const H = this._home(top);
    return {
      head: 'BRIDGES BETWEEN HOUSES',
      rows: [
        { title: 'BUILD A BRIDGE', blurb: 'Pick a style, then the two doors it joins — any floor to any floor.', go: () => { this._push(index, { v: 'linkshop', site: top.site }); return null; } },
        {
          title: 'SELL A BRIDGE', disabled: !(H.links ?? []).length, why: 'There are no bridges yet.',
          go: () => { this._push(index, { v: 'pick', site: top.site, kind: 'link', at: 0 }); return null; },
        },
      ],
    };
  }

  _v_linkshop(index, p, top) {
    const H = this._home(top);
    const rows = LINK_STYLES.map((S) => {
      const price = this.H.linkPrice(S.id);
      const first = portSpots(H, S.w).find((s) => s.floor === 0) ?? portSpots(H, S.w)[0];
      return {
        title: S.name, right: pts(price), blurb: S.blurb ?? '',
        disabled: !first || p.score < price,
        why: !first ? 'No wall has room for a door that wide.' : `${p.name} needs ${pts(price - p.score)} more.`,
        go: () => {
          this._push(index, { v: 'build', site: top.site, kind: 'link', sel: -1, style: S.id, floor: first.floor, a: null, cur: { hk: first.hk, floor: first.floor, side: first.side, at: first.at } });
          return null;
        },
      };
    });
    return { head: 'WHICH BRIDGE?', rows };
  }

  /* A BRIDGE WITH TURNS. "she sets the number of turns or parts, and places
     each turn's start and end". The two doors first; then HOW MANY TURNS,
     LEFT and RIGHT, with the ghost bending round its default corners as the
     number changes (`counting`); JUMP hands her each corner in turn, to slide
     with the stick and make a curve with ATTACK; JUMP on the last asks "are
     you sure?" (`_v_linkconfirm`) — Richard, Oct 2026: "once a bridge is
     complete and valid, ask 'Are you sure you want to build this bridge?'".
     The price on the button is the price with them. */
  _v_buildlink(index, p, top) {
    const H = this._home(top);
    const I = this.H.isleOf(top.site);
    const S = LINK_BY_ID[top.style];
    const n = top.turns ?? 0;
    const placing = top.vk != null;
    const counting = !!top.counting && !placing;
    const last = placing && top.vk >= n - 1;
    const toTurns = counting && n;
    const bad = top.a ? buildWhy(H, top, this.H.envOf(I)) : null;
    const price = this.H.linkPrice(top.style, linkOf(H, top));
    const v = placing ? top.via[top.vk] : null;
    const keys = placing
      ? [['STICK', `move turn ${top.vk + 1}`], ['ATTACK', v?.smooth ? 'make it a corner' : 'make it a curve'], ['JUMP', last ? 'build it' : 'next turn'], ['SPRINT', 'back'], ['INTERACT', 'back']]
      : counting
        ? [['◀ ▶', 'fewer or more turns'], ['JUMP', n ? 'place the turns' : 'build it'], ['SPRINT', 'other door'], ['INTERACT', 'back']]
        : [['STICK', 'next door'], ['ATTACK', 'next floor'], ['JUMP', !top.a ? 'this door' : 'that door'], ['SPRINT', top.a ? 'other first door' : 'back'], ['INTERACT', 'back']];
    const msg = !top.a ? `Pick the FIRST door — floor ${top.floor + 1}. ATTACK goes up a floor.`
      : placing ? (bad ?? `Turn ${top.vk + 1} of ${n} — ${v?.smooth ? 'a smooth curve' : 'a sharp corner'}. ${last ? 'It reaches! JUMP builds it.' : 'JUMP for the next turn.'}`)
      : counting ? (n ? `${n} turn${n > 1 ? 's' : ''} — ◀ ▶ to change it, JUMP to place ${n > 1 ? 'them' : 'it'}.` : (bad ?? 'Straight across — ◀ ▶ adds turns, JUMP builds it.'))
      : 'Now pick the door on the OTHER house.';
    return {
      build: true,
      head: `${S.name} — ${placing ? `TURN ${top.vk + 1} OF ${n}` : counting ? `TURNS: ${n}` : top.a ? 'THE OTHER DOOR' : 'THE FIRST DOOR'}`,
      body: `<div class="hs-buildrow"><canvas class="hs-map" width="180" height="180"></canvas><div class="hs-buildinfo">
        <div class="${bad && (placing || (counting && !n)) ? 'hs-bad' : 'hs-good'}">${esc(msg)}</div>
        <div class="hs-keys">${keys.map(([k, w]) => `<span><b>${k}</b> ${w}</span>`).join('')}</div>
        ${this._touch() ? this._touchPad(index, true, false, counting ? 'TURNS' : 0) : ''}</div></div>`,
      rows: [{
        title: !top.a ? 'THIS DOOR FIRST' : !counting && !placing ? 'THAT DOOR' : toTurns ? 'PLACE THE TURNS' : placing && !last ? 'NEXT TURN' : `BUILD IT — ${pts(price)}`,
        disabled: !top.a || (!counting && !placing) || toTurns || (placing && !last) ? false : !!bad || p.score < price,
        why: bad ?? `${p.name} needs ${pts(price - p.score)} more.`,
        go: () => { this.placeHere(index, top); return null; },
      }],
      foot: ' ',
    };
  }

  /** "Are you sure?" before asking the owners for a share — NO first, and no `.primary` (non-negotiable 7). */
  _v_joinconfirm(index, p, top) {
    const H = this._home(top);
    if (!H) return { head: 'BUY A SHARE', rows: [{ title: 'THIS HOME WAS SOLD', go: () => 'close' }] };
    const each = Math.floor(top.price / H.owners.length);
    return {
      head: 'BUY A SHARE?',
      body: `<div class="hs-note">${esc(`${pts(top.price)} for a share of the ${HOUSE_BY_ID[H.house].name} — ${H.owners.length > 1 ? `${pts(each)} each to ${H.owners.join(' & ')}` : `all of it to ${H.owners[0]}`}. They have to say yes. Selling it back later pays ${Math.round(HOME_SELL * 100)}%.`)}</div>`,
      rows: [
        { title: 'NO, NOT NOW', go: () => { this._pop(index); return null; } },
        {
          title: `YES, ASK ${H.owners.length > 1 ? 'THEM' : 'HER'}`,
          go: () => {
            const why = this.H.shareWhy(p, H);
            if (why) { this.game.toast(why, index); return null; }
            const seats = H.owners.map((n) => this.game.players.find((q) => q?.style?.name === n)?.index);
            if (seats.some((k) => k == null)) { this.game.toast('Every owner has to be playing to say yes.', index); return null; }
            return this._askOthers(index, { kind: 'join', site: top.site, price: top.price, with: seats });
          },
        },
      ],
    };
  }

  /** Selling her share back — NO first. */
  _v_sellshare(index, p, top) {
    const H = this._home(top);
    if (!H) return { head: 'SELL MY SHARE', rows: [{ title: 'THIS HOME WAS SOLD', go: () => 'close' }] };
    const back = Math.round((H.paid?.[p.style.name] ?? 0) * HOME_SELL);
    const rest = H.owners.filter((n) => n !== p.style.name);
    return {
      head: 'SELL MY SHARE?',
      body: `<div class="hs-note">${esc(`Roshi pays back ${pts(back)}. The castle stays ${rest.join(' & ')}'s — your colours and your statue come off it, its doors stop opening for you, and any room you claimed is free again.`)}</div>`,
      rows: [
        { title: 'NO, KEEP MY SHARE', go: () => { this._pop(index); return null; } },
        {
          title: `YES, SELL IT — ${pts(back)}`,
          go: () => {
            const r = this.H.leaveHome(p, H);
            this.game.toast(r.ok ? `${p.name} sold her share back for ${pts(r.back)}.` : r.why, index);
            return r.ok ? 'close' : null;
          },
        },
      ],
    };
  }

  /** "Are you sure you want to build this bridge?" — NO first, and no `.primary` (non-negotiable 7). */
  _v_linkconfirm(index, p, top) {
    const S = LINK_BY_ID[top.L.style];
    const n = top.L.via?.length ?? 0;
    return {
      head: 'BUILD THIS BRIDGE?',
      body: `<div class="hs-note">${esc(`Are you sure you want to build this ${S.name.toLowerCase()}${n ? ` with ${n} turn${n > 1 ? 's' : ''}` : ''}? It costs ${pts(top.price)}.`)}</div>`,
      rows: [
        { title: 'NO, KEEP CHANGING IT', go: () => { this._pop(index); return null; } },
        {
          title: `YES, BUILD IT — ${pts(top.price)}`,
          go: () => {
            const r = this.H.buildLink(this.game.players[index], this._home(top), top.L, false);
            this._pop(index);
            if (r.blockers?.length) { this._push(index, { v: 'linkblock', site: top.site, L: top.L, cursor: 0 }); return null; }
            if (r.ok) this._pop(index);
            return null;
          },
        },
      ],
    };
  }

  /** JUMP on a doorway: the first one is remembered, the second asks how many turns, the last asks if she is sure. */
  _linkHere(index, p, H, top) {
    if (!top.cur) return;
    if (!top.a) {
      top.a = { ...top.cur };
      this.game.audio?.play?.('menu');
      this.game.toast('Now pick the door on the OTHER house.', index);
      // hop to the nearest door on another house, so the first press of the stick is not wasted
      this.H.builder.hopPort(top, 0, 0);
      return;
    }
    const n = top.turns ?? 0;
    if (!top.counting && top.vk == null) {
      // the doors are chosen: how many turns?
      top.b = { ...top.cur };
      top.counting = true;
      this.game.audio?.play?.('menu');
      this.game.toast('How many turns? LEFT and RIGHT — then JUMP.', index);
      return;
    }
    if (n && top.vk == null) {
      // hand her the corners, starting where the ghost already showed them
      top.via = defaultVia(H, top.a, top.b, n, this.H.envOf(this.H.isleOf(top.site)).gyAt);
      top.vk = 0;
      this.game.audio?.play?.('menu');
      this.game.toast('Slide turn 1 with the stick — ATTACK makes it a smooth curve. JUMP when it is in place.', index);
      return;
    }
    if (n && top.vk < n - 1) {
      top.vk++;
      this.game.audio?.play?.('menu');
      this.game.toast(`Now turn ${top.vk + 1}.`, index);
      return;
    }
    // complete: buildable and affordable BEFORE she is asked whether she is sure
    const L = linkOf(H, top);
    const env = this.H.envOf(this.H.isleOf(top.site));
    const bad = buildWhy(H, top, env);
    const price = this.H.linkPrice(top.style, L);
    if (bad && !linkBlockers(H, L, env).length) { this.game.toast(bad, index); this.game.audio?.play?.('menu'); return; }
    if (p.score < price) { this.game.toast(`${p.name} needs ${pts(price - p.score)} more.`, index); return; }
    this._push(index, { v: 'linkconfirm', site: top.site, L, price, cursor: 0 });
  }

  /** SPRINT while picking doors: forget the first door, or leave. */
  linkBack(index, top) {
    // placing turns: back a turn, and from the first back to choosing the other door
    if (top.vk != null) {
      if (top.vk > 0) top.vk--;
      else top.vk = null;   // back to how many
      this.game.audio?.play?.('menu');
      return;
    }
    if (top.counting) { top.counting = false; top.cur = top.b; top.b = null; this.game.audio?.play?.('menu'); return; }
    if (top.a) { top.cur = top.a; top.a = null; top.floor = top.cur.floor; this.game.audio?.play?.('menu'); return; }
    this._pop(index);
  }

  /** "If ... an object is interfering with building the bridge, then we can offer to the player to automatically sell the object." */
  _v_linkblock(index, p, top) {
    const H = this._home(top);
    const I = this.H.isleOf(top.site);
    const block = linkBlockers(H, top.L, this.H.envOf(I));
    const names = block.map((k) => ITEM_BY_ID[H.outdoor[k]?.id]?.name ?? 'thing');
    const back = block.reduce((s, k) => s + this._sellBack(H.outdoor[k]?.id), 0);
    return {
      head: 'SOMETHING IS IN THE WAY',
      body: `<div class="hs-note">${esc(`The bridge is too low to go over the ${names.join(', the ')}. Roshi can buy ${names.length === 1 ? 'it' : 'them'} back for ${pts(back)} and build the bridge anyway.`)}</div>`,
      rows: [
        { title: 'NO, KEEP IT AND DO NOT BUILD', go: () => { this._pop(index); return null; } },
        {
          title: `YES, SELL ${names.length === 1 ? 'IT' : 'THEM'} AND BUILD THE BRIDGE`,
          go: () => {
            const r = this.H.buildLink(p, H, top.L, true);
            this._pop(index);
            if (r.ok) this._pop(index);
            return null;
          },
        },
      ],
    };
  }

  _v_selllink(index, p, top) {
    const H = this._home(top);
    const L = (H.links ?? []).find((x) => x.uid === top.uid);
    const back = Math.round((L?.paid ?? 0) * HOME_SELL);
    return {
      head: 'SELL THIS BRIDGE?',
      body: '<div class="hs-note">Its doors are walled up again.</div>',
      rows: [
        { title: `NO, KEEP THE ${LINK_BY_ID[L?.style]?.name ?? 'BRIDGE'}`, go: () => { this._pop(index); return null; } },
        {
          title: `YES, SELL IT FOR ${pts(back)}`,
          go: () => {
            const n = this.H.sellLink(p, H, top.uid);
            this.game.toast(`Roshi paid ${pts(n)} for the bridge.`, index);
            this._pop(index); this._pop(index);
            return null;
          },
        },
      ],
    };
  }

  _v_chest(index, p, top) {
    const H = this._home(top);
    const rows = (H.chest ?? []).map((id) => ({ title: ITEM_BY_ID[id]?.name ?? id, go: () => null }));
    if (!rows.length) rows.push({ title: 'THE CHEST IS EMPTY', blurb: 'PLACEHOLDER: putting things away is a follow-up.', go: () => null });
    return { head: 'STORAGE CHEST', rows };
  }

  /* ------------------------------ JUKEBOX ------------------------------- */

  _v_jukebox(index, p, top) {
    const I = this.H.isles[top.k];
    const H = I?.home;
    const site = I?.site.id;
    const own = H?.owners.includes(p.style.name);
    const cur = this.H.store.jukebox?.[site] ?? JUKEBOX[0].id;
    const rows = JUKEBOX.map((t) => ({
      title: `${t.id === cur ? '♪ ' : ''}${t.name}`,
      right: hasRecording(t.id) ? '' : '(tune)',
      disabled: !own, why: `Only ${H?.owners.join(' & ')} can pick the music here.`,
      go: () => {
        this.H.store.jukebox[site] = t.id;
        this.H.musicSite = site;
        this.H.save();
        this.game.toast(`Now playing: ${t.name}`, index);
        return null;
      },
    }));
    return { head: "ROSHI'S BOOMBOX", rows };
  }

  /* ------------------------------- MEAL --------------------------------- */

  /**
   * "Are you sure you want to eat with everyone at the table?" — Richard's
   * words, NO first. Who would sit and how many plates are on the table are
   * on its face; YES is greyed, saying how many more to cook, until there is
   * a plate for everybody round it (activities.js `mealWhy`).
   */
  _v_meal(index, p, top) {
    const A = this.H.activities;
    const n = A.platesOn(top.key);
    const who = A.dinersAt(top.key, index);
    const why = A.mealWhy(top.key, index);
    return {
      head: 'EAT TOGETHER?',
      body: `<div class="hs-note">Are you sure you want to eat with everyone at the table?<br>
        ${n} plate${n === 1 ? '' : 's'} on the kotatsu · ${who.map((q) => esc(q.name)).join(', ') || 'nobody'} will sit down.</div>`,
      rows: [
        { title: 'NO, NOT YET', go: () => 'close' },
        {
          title: `YES, EAT TOGETHER${who.length > 1 ? ` — ${who.length} OF US` : ''}`,
          disabled: !!why, why,
          go: () => (A.startMeal(top.key, index) ? 'close' : null),
        },
      ],
    };
  }

  /* ------------------------------ WINDOW -------------------------------- */

  /** Looking out is a choice, not what opening it does (housing.js 'window'). */
  _v_window(index, p, top) {
    const s = top.spot;
    const q = s?.home?.rooms?.[s.room]?.wall?.[s.wk];
    const busy = this.H.activities.holds(index);
    return {
      head: 'THE WINDOW',
      body: `<div class="hs-note">The window is ${q?.open ? 'open' : 'shut'}.</div>`,
      rows: [
        { title: 'NO, LEAVE IT', go: () => 'close' },
        {
          title: 'LOOK OUT OF THE WINDOW', blurb: 'She opens it and takes a long look at the yard.',
          disabled: !q || busy, why: busy ? 'Finish what you are doing first.' : 'The window is gone.',
          go: () => (this.H.windowDo(p, s, { look: true }) ? 'close' : null),
        },
        {
          title: q?.open ? 'SHUT THE WINDOW' : 'OPEN THE WINDOW',
          disabled: !q, why: 'The window is gone.',
          go: () => (this.H.windowDo(p, s, { open: !q.open }) ? 'close' : null),
        },
      ],
    };
  }

  /* ------------------------------- KOI ---------------------------------- */

  _v_koi(index, p, top) {
    const H = this._home(top);
    const fish = this.H.koi.describe(H);
    const rec = this.H.store.records?.fish ?? {};
    return {
      head: 'THE KOI POND',
      body: `<div class="hs-note">${fish.map((f) => `${f.rare ? '★' : ''}${f.name} (size ${f.size})`).join(' · ') || 'No koi yet.'}</div>`,
      rows: [
        { title: 'FEED THE KOI', blurb: 'Fed twice a day at most, they grow — and new ones sometimes come.', go: () => { this.H.koi.feed(p, H); return null; } },
        {
          /* FISHING IS IN THE WORLD NOW (angling.js): this row hands her a rod
             from the stand, the same as walking up to it and pressing ACTION. */
          title: this.H.angling.holding(index) ? 'PUT THE ROD BACK' : 'GO FISHING',
          blurb: 'Wild fish swim in the pond — see one, cast near it. HOLD ATTACK: the longer you hold, the further it goes.',
          go: () => {
            const v = this.H.angling.ponds.get(top.site);
            if (v) { this.H.angling.toggle(p, v); this.game.inspector.closeOne(index); }
            else this.game.toast?.('The pond has no fish yet — come back in a moment.', index);
            return null;
          },
        },
        {
          title: 'RECORD BOARD', blurb: Object.keys(rec).length ? Object.entries(rec).map(([k, r]) => `${k.toUpperCase()} ${r.lb}lb (${r.who})`).join(' · ') : 'No records yet — be the first!',
          go: () => null,
        },
      ],
    };
  }

  /* ------------------------------- PEN ---------------------------------- */

  _v_pen(index, p, top) {
    const H = this._home(top);
    const D = this.H.farm.describe(H);
    const B = careBuff(D.level);
    const perks = [B.hp > 1 && 'more health', B.dmg > 1 && 'harder claws', B.jump && 'an extra jump', B.sweep && 'its own sweep'].filter(Boolean);
    return {
      head: 'THE ANIMALS',
      body: `<div class="hs-note">${D.animals.map((a) => `${a.name}: ${a.hungry ? 'HUNGRY!' : 'happy'}`).join(' · ')}<br>Panda care ${D.level}/4${perks.length ? ` — your panda has ${perks.join(', ')}` : ''}.</div>`,
      rows: [
        { title: 'FEED THE ANIMALS', blurb: 'One visit a day counts. Two visits a day apart in a week is the big bonus.', go: () => { this.H.farm.feed(p, H); return null; } },
        ...this._petRows(index, p, H),
      ],
    };
  }

  /** PLAYING WITH THEM (petplay.js): a walk for any of them, and each one's
   *  own game. Each row says what that animal's happiness is worth to her,
   *  so the boost is never a secret (Richard: "the player should be informed
   *  which ability is being boosted"). Picking one closes the card: the game
   *  is out in the world. */
  _petRows(index, p, H) {
    const P = this.H.pets;
    const go = (kind, a) => () => { if (P.start(p, H, kind, a)) this.game.inspector.closeOne(index); return null; };
    const rows = [];
    if (P.playing(index)) rows.push({ title: 'STOP PLAYING', blurb: 'The animal trots back to the pen.', go: () => { P.stop(index, null); return null; } });
    const B = petBoost(H.pen);
    for (const A of H.pen?.animals ?? []) {
      const def = ANIMALS.find((d) => d.id === A.kind);
      if (!def) continue;
      const L = petLevel(A);
      const now = B.lines.find((l) => l.startsWith(BOOST_NAME[A.kind])) ?? `${BOOST_NAME[A.kind]} +0%`;
      const tag = `Level ${L} of 4 · gives ${now}`;
      rows.push({ title: `WALK THE ${def.name}`, blurb: `It follows you round your island. ${tag}.`, go: go('walk', A.kind) });
      if (A.kind === 'goat') rows.push({ title: 'PLAY FETCH WITH THE GOAT', blurb: `HOLD ATTACK to throw — it has to RUN for it. ${tag}.`, go: go('fetch', A.kind) });
      if (A.kind === 'chick') rows.push({ title: 'CATCH THE CHICK', blurb: `Jump and touch it ${PLAY.wins} times. It flies higher as it grows. ${tag}.`, go: go('catch', A.kind) });
      if (A.kind === 'bunny') rows.push({ title: 'HOP ALONG WITH THE BUNNY', blurb: `Watch its hops, then JUMP in the same rhythm. ${tag}.`, go: go('hop', A.kind) });
    }
    return rows;
  }

  /* KOI_COLOURS is re-exported for the Help card, which lists the rares. */
  static get KOI() { return KOI_COLOURS; }
}
