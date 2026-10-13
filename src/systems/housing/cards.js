import {
  HOME_SITES, SITE_BY_ID, HOUSES, HOUSE_BY_ID, ITEMS, ITEM_BY_ID, PRESETS, PRESET_BY_ID, ROOM_TYPES, HOME_SELL,
} from './catalog.js';
import { JUKEBOX, hasRecording } from './jukebox.js';
import { footprint, firstFit, firstYardSpot, wallSlots, wallFree, ITEM_SELL } from './editor.js';
import { buildWhy, commitBuild, removeBuilt, pickList, stepToward, BUILD_KEYS, PICK_KEYS } from './build.js';
import { Preview } from './preview.js';
import { Fishing } from './fishing.js';
import { KOI_COLOURS } from './koi.js';
import { careBuff } from './farm.js';

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
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pts = (n) => `${Math.round(n).toLocaleString()} pts`;
/** "EMBER'S", "EMBER & FROST'S" — the whole thing in capitals or none of it. */
export const possessive = (names) => `${[].concat(names).join(' & ').toUpperCase()}'S`;
/** What Roshi pays back for everything in a room. */
export function roomRefund(Hs, R) {
  return (R?.items ?? []).reduce((a, q) => a + Math.round(Hs.itemPrice(q.id) * ITEM_SELL), 0);
}

/**
 * Turn a room into another type, SELLING its furniture back first — so a
 * kitten a few points short of a holodeck can pay for it with the furniture
 * it replaces. What she is paid back comes off what she is recorded as having
 * put into the home, so a later SELL MY HOME does not refund it twice.
 */
export function changeRoomType(Hs, p, H, R, type, price) {
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
  Hs.changed(H);
  return { ok: true, refund };
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
    this.preview = new Preview();
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
    return true;
  }

  /* ------------------------- the provider interface --------------------- */

  startRow(index) { return this._top(index)?.cursor ?? 0; }

  opened(index) {
    const top = this._top(index);
    if (top?.v === 'realtor') this.H.browse(index, HOME_SITES[0].id);
  }

  closed(index) {
    this.H.browsing.delete(index);
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
    return [this.st.get(index)?.stack.length, top?.v, top?.room, top?.kind, top?.sel, top?.gx, top?.gz, top?.rot, top?.side, top?.k, top?.at,
      top?.v === 'build' && top.kind === 'yard' ? `${Math.round(top.x * 2)},${Math.round(top.z * 2)}` : '',
      p?.score, this.H.store.at, this.pending ? [...this.pending.yes].join(',') : '', c.i].join('|');
  }

  back(index) {
    const top = this._top(index);
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
    if (top?.v === 'fishing') {
      const F = this.st.get(index).fish;
      if (pad.pressed('interact')) return false; // BACK, handled by the card
      F.step(pad, dt);
      F.draw(c.el?.querySelector('canvas.hs-fish'));
      const m = c.el?.querySelector('.hs-fishmsg');
      if (m && m.textContent !== F.msg) m.textContent = F.msg;
      return false;
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
    if (act === 'reel' && top?.v === 'fishing') this.st.get(index).fish?.tap();
    if (top?.v === 'build' || top?.v === 'pick') {
      const B = this.H.build;
      const step = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[act];
      if (step && top.v === 'pick') {
        const L = pickList(this._home(top), top.kind, top.room);
        const k = L[top.at ?? 0] ? stepToward(L, L[top.at ?? 0], step[0], step[1]) : -1;
        if (k >= 0) top.at = k;
      } else if (step && top.kind === 'yard') { top.x += step[0] * 1.5; top.z += step[1] * 1.5; }
      else if (step && top.kind === 'wall') B.hop(top, step[0], step[1]);
      else if (step) B.nudge(top, step[0], step[1]);
      if (act === 'rot') B.rotate(top);
      if (act === 'sell') this.askSell(index, top);
    }
  }

  painted(index, c, el) {
    const top = this._top(index);
    if (top?.v === 'fishing') this.st.get(index).fish?.draw(el.querySelector('canvas.hs-fish'));
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
      return {
        head: s.name, body,
        rows: [{ title: `${H.owners.join(' & ')} LIVES HERE`, blurb: `A ${HOUSE_BY_ID[H.house].name}. Not for sale.`, go: () => null }],
      };
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
      : `sell your shared home on ${SITE_BY_ID[P.site].name}`;
    return {
      head: `${who.toUpperCase()} ASKS`,
      body: `<div class="hs-note">${esc(who)} wants to ${esc(what)}.</div>`,
      rows: [
        { title: P.kind === 'buy' ? 'NO, NOT ME' : 'NO, KEEP OUR HOME', go: () => { this._answer(index, false); return 'close'; } },
        { title: P.kind === 'buy' ? 'YES, COUNT ME IN' : 'YES, SELL IT', go: () => { this._answer(index, true); return 'close'; } },
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
    if (P.kind === 'buy') {
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
      { title: 'FURNISH A ROOM', blurb: 'Furniture on the tatami grid, and kendo or holodeck rooms.', go: () => { this._push(index, { v: 'rooms', site: top.site }); return null; } },
      { title: 'THE YARD', blurb: 'Build anywhere on your island — ponds, a farm, a pen, the treehouse, and decorations.', go: () => { this._push(index, { v: 'yard', site: top.site }); return null; } },
      /* NO MUSIC ROW AND NO FILE ROWS. Richard: "Changing the music should be
         done from the boombox at the entrance and exit to the bridge", and the
         .json save/load "shouldn't be in the menu. Let's have that as a Debug
         action for now" — main.js `_debugHousingExport`/`_debugHousingImport`. */
    ];
    if (def.rooms.some((r) => r.claim)) {
      rows.push({ title: 'CASTLE ROOMS', blurb: 'Claim a room by walking into it first. Lock yours or invite your sisters in.', go: () => { this._push(index, { v: 'claims', site: top.site }); return null; } });
    }
    rows.push(
      { title: 'STORAGE CHEST', blurb: 'Things you have put away.', go: () => { this._push(index, { v: 'chest', site: top.site }); return null; } },
      { title: 'SELL MY HOME', blurb: `Roshi pays back ${Math.round(HOME_SELL * 100)}%.`, go: () => { this._push(index, { v: 'sell', site: top.site, cursor: 0 }); return null; } },
    );
    return { head: `${SITE_BY_ID[top.site].name}`, rows, backWord: 'CLOSE' };
  }

  _v_rooms(index, p, top) {
    const H = this._home(top);
    const def = HOUSE_BY_ID[H.house];
    const rows = def.rooms.map((room) => {
      const R = H.rooms?.[room.id];
      const claim = R?.claim;
      const notMine = claim && claim !== p.style.name;
      return {
        title: room.name,
        right: ROOM_TYPES.find((t) => t.id === (R?.type ?? 'living'))?.name ?? '',
        blurb: `${(R?.items ?? []).length} things${claim ? ` · ${claim}'s room` : ''}`,
        disabled: !!notMine, why: `That is ${claim}'s room — only she can change it.`,
        go: () => { this._push(index, { v: 'room', site: top.site, room: room.id }); return null; },
      };
    });
    return { head: 'WHICH ROOM?', rows };
  }

  _roomDef(H, id) { return HOUSE_BY_ID[H.house].rooms.find((r) => r.id === id); }

  _v_room(index, p, top) {
    const H = this._home(top);
    const room = this._roomDef(H, top.room);
    H.rooms ??= {};
    const R = (H.rooms[room.id] ??= { type: 'living', items: [] });
    R.items ??= [];
    const rows = [];
    for (const T of ROOM_TYPES) {
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
    }
    const slots = wallSlots(H.house, room).length;
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

  /** CHANGE THE ROOM? No is first; the furniture's refund is in the question. */
  _v_roomtype(index, p, top) {
    const H = this._home(top);
    const room = this._roomDef(H, top.room);
    const R = H.rooms[room.id];
    const T = ROOM_TYPES.find((t) => t.id === top.type);
    const price = this.H.roomPrice(T.id);
    const refund = roomRefund(this.H, R);
    const n = (R.items ?? []).length;
    return {
      head: `MAKE IT A ${T.name}?`,
      body: `<div class="hs-note">${n
        ? `The ${n} thing${n > 1 ? 's' : ''} in the ${esc(room.name)} will be SOLD BACK to Roshi for ${pts(refund)}.`
        : `The ${esc(room.name)} is empty.`} It costs ${price ? pts(price) : 'nothing'}.</div>`,
      rows: [
        { title: 'NO, KEEP THE ROOM AS IT IS', go: () => { this._pop(index); return null; } },
        {
          title: `YES, MAKE IT A ${T.name}${n ? ' AND SELL THE FURNITURE' : ''}`,
          disabled: p.score + refund < price,
          why: `${p.name} needs ${pts(price - p.score - refund)} more.`,
          go: () => {
            const r = changeRoomType(this.H, p, H, R, T.id, price);
            if (!r.ok) { this.game.toast(r.why, index); return null; }
            this.game.toast(`The ${room.name} is now a ${T.name}!${r.refund ? ` Roshi paid ${pts(r.refund)} for the furniture.` : ''}`, index);
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
      && (top.kind !== 'yard' || !!it.deco === !!top.deco));
    const rows = list.map((it) => {
      const price = this.H.itemPrice(it.id);
      let spot = null;
      if (top.kind === 'room') spot = firstFit(room, R.items, it);
      else if (top.kind === 'wall') {
        const S = wallSlots(H.house, room).find((s) => wallFree(R, s.side, s.k));
        spot = S && { side: S.side, k: S.k };
      } else spot = firstYardSpot(H, it, I?.radius ?? 50);
      return {
        title: it.later ? `${it.name} — COMING LATER` : it.name,
        right: it.later ? 'LOCKED' : pts(price),
        blurb: `YOU HAVE ${ownedCount(H, it.id)}${it.blurb ? ` · ${it.blurb}` : top.kind === 'room' ? ` · ${footprint(it).join('×')} tatami.` : ''}`,
        disabled: it.later || !spot || p.score < price,
        why: it.later ? 'Coming in a later update!'
          : !spot ? (top.kind === 'wall' ? 'Every wall here is full.' : 'There is no room left for that here.')
            : `${p.name} needs ${pts(price - p.score)} more.`,
        item: it.id,
        go: () => { this._push(index, { v: 'build', site: top.site, room: top.room, kind: top.kind, sel: -1, id: it.id, rot: 0, ...spot }); return null; },
      };
    });
    const c = this.game.inspector.cards[index];
    this.preview.show(index, rows[Math.min(c?.i ?? 0, rows.length - 1)]?.item);
    const head = top.kind === 'wall' ? 'FOR THE WALLS' : top.kind === 'yard' ? (top.deco ? 'DECORATIONS' : 'FOR THE YARD') : 'ADD FURNITURE';
    return { head, body: '<canvas class="hs-prev" width="200" height="140"></canvas>', rows };
  }

  /**
   * BUILD MODE'S CARD — small, at the bottom, see-through, so the world is
   * the thing she is looking at. The corner map, the key legend, and what is
   * wrong if it is red. The pad is `BuildMode.drive`'s; these rows are for a
   * finger (a tap on PUT IT HERE), and for a phone the four keys are buttons.
   */
  _v_build(index, p, top) {
    const H = this._home(top);
    const I = this.H.isleOf(top.site);
    const it = ITEM_BY_ID[top.id];
    const bad = buildWhy(H, top, I?.radius ?? 50);
    const price = top.sel < 0 ? this.H.itemPrice(it.id) : 0;
    const touch = this._touch();
    const rows = [{
      title: top.sel < 0 ? `PUT IT HERE — ${pts(price)}` : 'PUT IT HERE',
      disabled: !!bad || p.score < price,
      why: bad ?? `${p.name} needs ${pts(price - p.score)} more.`,
      go: () => { this.placeHere(index, top); return null; },
    }];
    if (top.sel >= 0) rows.push({ title: `SELL IT BACK — ${pts(this._sellBack(it.id))}`, go: () => { this.askSell(index, top); return null; } });
    const keys = BUILD_KEYS.filter(([, w]) => w !== 'sell' || top.sel >= 0).filter(([, w]) => w !== 'turn' || top.kind !== 'wall');
    return {
      build: true,
      head: it.name,
      body: `<div class="hs-buildrow"><canvas class="hs-map" width="180" height="180"></canvas><div class="hs-buildinfo">
        <div class="${bad ? 'hs-bad' : 'hs-good'}">${esc(bad ?? (top.sel < 0 ? 'It fits! Press JUMP to put it here.' : 'It fits here.'))}</div>
        <div class="hs-keys">${keys.map(([k, w]) => `<span><b>${k}</b> ${w}</span>`).join('')}</div>
        ${touch ? this._touchPad(index, top.kind !== 'wall', top.sel >= 0) : ''}</div></div>`,
      rows,
      foot: ' ',
    };
  }

  /** THE SELECTOR: a ring on one of her things; the stick hops it. */
  _v_pick(index, p, top) {
    const H = this._home(top);
    const L = pickList(H, top.kind, top.room);
    if (!L.length) return { head: 'NOTHING HERE', rows: [{ title: 'BACK', go: () => { this._pop(index); return null; } }] };
    top.at = Math.min(top.at ?? 0, L.length - 1);
    const q = L[top.at];
    const it = ITEM_BY_ID[q.id];
    const touch = this._touch();
    return {
      build: true,
      head: `${it?.name ?? q.id}  (${top.at + 1} of ${L.length})`,
      body: `<div class="hs-buildrow"><canvas class="hs-map" width="180" height="180"></canvas><div class="hs-buildinfo">
        <div class="hs-good">The ring shows which one. Move the stick to point at another.</div>
        <div class="hs-keys">${PICK_KEYS.map(([k, w]) => `<span><b>${k}</b> ${w}</span>`).join('')}</div>
        ${touch ? `<div class="hs-pad">${['left', 'up', 'down', 'right'].map((d) => `<button type="button" data-hact="${d}" data-side="${index}">${ARROW[d]}</button>`).join('')}</div>` : ''}</div></div>`,
      rows: [
        { title: 'PICK IT UP AND MOVE IT', go: () => { this.pickUp(index, top); return null; } },
        { title: `SELL IT BACK — ${pts(this._sellBack(q.id))}`, go: () => { this.askSell(index, top); return null; } },
      ],
      foot: ' ',
    };
  }

  _touch() {
    return !!(this.game.touchUI ?? (typeof document !== 'undefined' && document.body.classList.contains('touch-ui')));
  }

  _touchPad(index, turn, sell) {
    const b = (act, label) => `<button type="button" data-hact="${act}" data-side="${index}">${label}</button>`;
    return `<div class="hs-pad">${['left', 'up', 'down', 'right'].map((d) => b(d, ARROW[d])).join('')}${turn ? b('rot', '⟳') : ''}${sell ? b('sell', 'SELL') : ''}</div>`;
  }

  _sellBack(id) { return Math.round(this.H.itemPrice(id) * ITEM_SELL); }

  /** From the selector into build mode, holding the one under the ring. */
  pickUp(index, top) {
    const H = this._home(top);
    const L = pickList(H, top.kind, top.room);
    const q = L[top.at ?? 0];
    if (!q) return;
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
    const it = ITEM_BY_ID[top.id];
    const bad = buildWhy(H, top, I?.radius ?? 50);
    if (bad) { this.game.toast(bad, index); this.game.audio?.play?.('menu'); return; }
    const price = top.sel < 0 ? this.H.itemPrice(it.id) : 0;
    if (price && !this.H.spend(p, H, price)) { this.game.toast(`${p.name} needs ${pts(price - p.score)} more.`, index); return; }
    commitBuild(H, top);
    this.H.changed(H);
    this.game.audio?.play?.('land');
    this.game.toast(top.sel < 0 ? `The ${it.name} is in!` : `Moved the ${it.name}.`, index);
    this._pop(index);
  }

  /** SPRINT in build or pick mode: the "are you sure", if there is a thing to sell. */
  askSell(index, top) {
    let sel = top.sel;
    if (top.v === 'pick') sel = pickList(this._home(top), top.kind, top.room)[top.at ?? 0]?.k ?? -1;
    if (sel == null || sel < 0) { this.game.toast('That is not yours yet — there is nothing to sell back.', index); return; }
    this._push(index, { v: 'sellitem', site: top.site, room: top.room, kind: top.kind, sel, cursor: 0 });
  }

  _v_sellitem(index, p, top) {
    const H = this._home(top);
    const list = top.kind === 'yard' ? H.outdoor : top.kind === 'wall' ? H.rooms?.[top.room]?.wall : H.rooms?.[top.room]?.items;
    const q = list?.[top.sel];
    const it = ITEM_BY_ID[q?.id];
    const back = this._sellBack(it?.id);
    return {
      head: 'SELL IT BACK?',
      body: q?.id === 'pen' || q?.id === 'koipond' ? '<div class="hs-note">The animals and the koi wait for you — build it again and they come back.</div>' : '',
      rows: [
        { title: `NO, KEEP THE ${it?.name ?? 'THING'}`, go: () => { this._pop(index); return null; } },
        {
          title: `YES, SELL IT FOR ${pts(back)}`,
          go: () => {
            if (!removeBuilt(H, top.kind, top.room, top.sel)) return null;
            p.score += back;
            const n = p.style?.name;
            if (n && H.paid) H.paid[n] = Math.max(0, (H.paid[n] ?? 0) - back);
            this.game.onScoreChanged?.(p);
            this.H.changed(H);
            this.game.toast(`Roshi paid ${pts(back)} for the ${it?.name ?? 'thing'}.`, index);
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
        {
          title: 'MOVE OR SELL', blurb: 'Point at something outside and pick it up.',
          disabled: !(H.outdoor ?? []).length, why: 'There is nothing in the yard yet.',
          go: () => { this._push(index, { v: 'pick', site: top.site, kind: 'yard', at: 0 }); return null; },
        },
      ],
    };
  }

  _v_claims(index, p, top) {
    const H = this._home(top);
    const def = HOUSE_BY_ID[H.house];
    const rows = def.rooms.filter((r) => r.claim).map((room) => {
      const who = H.rooms?.[room.id]?.claim;
      return {
        title: room.name, right: who ? possessive(who) : 'UNCLAIMED',
        blurb: who ? (who === p.style.name ? 'Yours. Your LOCK MY DOOR setting decides who else may come in.' : `${who} walked in first.`) : 'Walk into it first to claim it.',
        go: () => null,
      };
    });
    return { head: 'CASTLE ROOMS', rows };
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
          title: 'GO FISHING', blurb: 'Wild fish visit the pond. Catch one and Roshi buys it.',
          go: () => { this.st.get(index).fish = new Fishing(this.H, p, H); this._push(index, { v: 'fishing', site: top.site }); return null; },
        },
        {
          title: 'RECORD BOARD', blurb: Object.keys(rec).length ? Object.entries(rec).map(([k, r]) => `${k.toUpperCase()} ${r.lb}lb (${r.who})`).join(' · ') : 'No records yet — be the first!',
          go: () => null,
        },
      ],
    };
  }

  _v_fishing(index) {
    const F = this.st.get(index).fish;
    const touch = typeof document !== 'undefined' && document.body.classList.contains('touch-ui');
    return {
      head: 'FISHING',
      body: `<canvas class="hs-fish" width="320" height="170"></canvas><div class="hs-fishmsg">${esc(F?.msg ?? '')}</div>${touch ? `<button type="button" class="hs-reel" data-hact="reel" data-side="${index}">CAST / REEL</button>` : ''}`,
      rows: [],
      foot: 'JUMP <b>cast · hook · reel</b> · STICK <b>twitch</b> · INTERACT <b>stop</b>',
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
      ],
    };
  }

  /* KOI_COLOURS is re-exported for the Help card, which lists the rares. */
  static get KOI() { return KOI_COLOURS; }
}
