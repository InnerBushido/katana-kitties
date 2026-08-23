import { POWER_ORBS, ORB_BY_ID, MAX_EQUIPPED } from '../entities/powerorb.js';
import { MAX_PLAYERS, cssFor } from '../core/palette.js';

/* ---------------------------------------------------------------------------
   THE PERSONAL CARD — one kitten's own screen, inside her own pane.

   WHY IT EXISTS. The dealer's counter is a full-screen modal that freezes the
   world (see systems/profile.js), and until now it was the only way to look at
   your own orbs. Reported from four-player play: one kitten wanting to check
   what she was wearing stopped the other three dead and threw all four onto a
   screen three of them had not asked for. "Let them look at their setup
   without everyone playing being thrown on that screen."

   So the stall now asks a question instead of opening a shop:

     1. TRADE WITH THE DEALER  -> the shared counter, everybody, world frozen
     2. LOOK AT MY ORBS        -> this, hers alone, world running

   THE WORLD KEEPS RUNNING FOR EVERYBODY, INCLUDING HER. Her kitten is not
   paused — she is standing at a stall reading a card, and her sisters are
   still chasing rabbits. Only her PAD is taken, the same way the character
   picker takes one girl's pad and leaves the other three alone (see the
   dead-pad line in `Game._step`).

   SHE GETS HER OWN PANE WHILE IT IS UP. `clusterPlayers`' `solo` flag already
   exists for a kitten on a dragon, and it means exactly the right thing here:
   a girl reading a menu is not sharing a view with her sister. Without it a
   card would cover half of somebody else's game. `stablePanes` is what makes
   this bearable — the other panes do not get shuffled when hers appears.

   IT IS DOM, NOT DRAWN IN THE WORLD. Everything on it is small text: eight
   slot names, eight prices and a sentence of description each. A world-space
   Label at that size is unreadable at a quarter of a laptop screen, and this
   game is fill-bound (docs/notes/performance.md), so a second render pass for
   a menu is the one cost worth avoiding. Positioning comes free: the panes are
   already computed once a frame for `#pane-edges`.

   IT IS NOT A `Confirm`, AND IT IS NOT `MenuNav`. Both of those are one cursor
   for the whole screen, and up to four of these can be open at once with four
   different girls driving four of them. Same argument the trade screen makes,
   one step further.
--------------------------------------------------------------------------- */

/** Stick deflection before a nudge counts, and how fast a held stick repeats.
 *  Same numbers as the trade screen — one feel for every list in the game. */
const NAV_DEAD = 0.55;
const REPEAT_DELAY = 0.34;
const REPEAT_RATE = 0.12;

/** The two things the dealer can be asked for. Index into this is the cursor
 *  on the chooser, so the order is the order on screen. */
const CHOICES = [
  {
    key: 'trade',
    title: 'TRADE WITH THE DEALER',
    blurb: 'Buy and sell. Everybody stops and comes to the counter — '
      + 'they can join in with their own cursor.',
  },
  {
    key: 'look',
    title: 'LOOK AT MY ORBS',
    blurb: 'Just yours, just here. Everybody else keeps playing.',
  },
];

/** One player's card. Never shared; there is one of these per seat. */
class Card {
  constructor() {
    /** null | 'choose' | 'look' */
    this.state = null;
    this.i = 0;
    this.hold = 0;
    this.repeatT = 0;
    this.el = null;
    this._sig = '';
  }
}

export class Inspector {
  constructor(game) {
    this.game = game;
    this.host = document.getElementById('pane-cards');
    this.cards = Array.from({ length: MAX_PLAYERS }, () => new Card());
    this._bindTaps();
  }

  /* ------------------------------- state --------------------------------- */

  /** Is this seat's pad being eaten by a card? */
  busy(index) {
    return !!this.cards[index]?.state;
  }

  /** Is anybody's card up? Used to decide whether the host is drawn at all. */
  get any() {
    return this.cards.some((c) => c.state);
  }

  /**
   * Open the chooser for one kitten.
   *
   * SHE OPENS IT AND SHE CLOSES IT, and nobody else can do either. Every other
   * screen in this game is a modal somebody else can be dragged onto; the whole
   * point of this one is that it is hers.
   */
  open(index) {
    const c = this.cards[index];
    if (!c || c.state) return;
    c.state = 'choose';
    c.i = 0;
    c._sig = '';
    this.game.audio?.play('menu');
  }

  closeOne(index) {
    const c = this.cards[index];
    if (!c?.state) return;
    c.state = null;
    c.i = 0;
    c._sig = '';
    if (c.el) { c.el.remove(); c.el = null; }
    this.game.audio?.play('menu');
  }

  /** Everything down, silently. For restart, quit, and the tournament. */
  closeAll() {
    for (const c of this.cards) {
      c.state = null;
      c.i = 0;
      c._sig = '';
      if (c.el) { c.el.remove(); c.el = null; }
    }
    this.host?.classList.add('hidden');
  }

  /* ------------------------------- input --------------------------------- */

  /**
   * Read every open card's pad.
   *
   * CALLED BEFORE THE PLAYERS UPDATE, and the pads it reads are handed a dead
   * stick in the same frame — see `Game._step`. Reading them here and blanking
   * them there is what stops one press both choosing a menu row and swinging a
   * katana.
   */
  update(dt) {
    if (!this.any) return;
    const pads = this.game.input.players;
    for (let i = 0; i < this.cards.length; i++) {
      if (!this.cards[i].state) continue;
      /* A PLAYER WHO IS NO LONGER THERE TAKES HER CARD WITH HER. Dropping out
         with a card up used to be impossible because there were no cards; now
         it would leave a rectangle nobody can dismiss over a pane that belongs
         to somebody else. */
      if (!this.game.players[i]) { this.closeAll(); return; }
      this._drive(i, pads[i], dt);
    }
  }

  _drive(index, pad, dt) {
    const c = this.cards[index];
    if (!pad) return;
    const rows = this._rowCount(index);

    const raw = Math.abs(pad.my) > NAV_DEAD ? Math.sign(pad.my)
      : Math.abs(pad.mx) > NAV_DEAD ? Math.sign(pad.mx) : 0;
    let step = 0;
    if (raw === 0) c.hold = 0;
    else if (c.hold !== raw) { c.hold = raw; c.repeatT = REPEAT_DELAY; step = raw; }
    else {
      c.repeatT -= dt;
      if (c.repeatT <= 0) { c.repeatT = REPEAT_RATE; step = raw; }
    }
    if (step && rows > 0) {
      c.i = (c.i + step + rows) % rows;
      this.game.audio?.play('menu');
    }

    /* THE SAME THREE BUTTONS AS THE TRADE SCREEN, meaning the same three
       things. A fourth screen with a fourth control scheme is a fourth thing
       to explain to a nine-year-old.
         jump      choose the row
         interact  back out one level, then close
         start     close outright, from anywhere
       ATTACK IS DELIBERATELY NOT BOUND. On the shared counter it means SELL,
       and a girl who has learned that here would press it there expecting
       nothing to happen. */
    if (pad.pressed('start')) { this.closeOne(index); return; }
    if (pad.pressed('interact')) {
      if (c.state === 'look') { c.state = 'choose'; c.i = 1; c._sig = ''; this.game.audio?.play('menu'); }
      else this.closeOne(index);
      return;
    }
    if (pad.pressed('jump')) this._choose(index);
  }

  /** JUMP, or a tap on a row. */
  _choose(index) {
    const c = this.cards[index];
    if (c.state !== 'choose') return;
    const pick = CHOICES[c.i];
    if (!pick) return;
    if (pick.key === 'look') {
      c.state = 'look';
      c.i = 0;
      c._sig = '';
      this.game.audio?.play('menu');
      return;
    }
    /* HANDING OVER TO THE SHARED COUNTER TAKES EVERY CARD DOWN, not just hers.
       Two girls could each have a chooser open; one of them saying "everybody
       to the counter" makes the other's card a rectangle floating over a
       frozen world with a pad that no longer reaches it. */
    const shopper = this.game.players[index];
    this.closeAll();
    this.game.profile.open('shop', { shopper });
  }

  _rowCount(index) {
    const c = this.cards[index];
    if (c.state === 'choose') return CHOICES.length;
    /* THE SHELF IS THE LIST, AND HER OWN SLOTS ARE A HEADER ABOVE IT. Every
       orb she can own is on the shelf whether the dealer has one or not, so
       the row she is reading always says both what it does AND how many of it
       she is already wearing — which is the question "what should I buy"
       actually needs answering. A cursor that ranged over her eight slots
       instead would go dead the moment she owned nothing. */
    return POWER_ORBS.length;
  }

  /* -------------------------------- paint -------------------------------- */

  /**
   * Put every open card over its owner's pane.
   *
   * CALLED FROM `_paintPaneEdges` WITH THE SAME RECTANGLES, so a card and the
   * coloured frame around it can never disagree about where a pane is. Panes
   * arrive in WebGL coordinates (origin bottom-left) and CSS wants top-left,
   * exactly as the frames do.
   */
  layout(panes, groups, W, H) {
    if (!this.host) return;
    if (!this.any) {
      if (!this.host.classList.contains('hidden')) {
        this.host.classList.add('hidden');
        this.host.textContent = '';
        for (const c of this.cards) c.el = null;
      }
      return;
    }
    this.host.classList.remove('hidden');

    for (let i = 0; i < this.cards.length; i++) {
      const c = this.cards[i];
      if (!c.state) { if (c.el) { c.el.remove(); c.el = null; } continue; }
      const g = groups.findIndex((m) => m.includes(i));
      const v = panes[g];
      /* NO PANE MEANS NOWHERE TO DRAW IT, which happens for exactly one frame
         when she opens a card while grouped: `solo` splits her out on the NEXT
         cluster pass. Hiding for a frame is right; guessing a rectangle would
         put her card over somebody else's game. */
      if (!v) { if (c.el) c.el.style.display = 'none'; continue; }
      if (!c.el) {
        c.el = document.createElement('div');
        c.el.className = 'pane-card';
        c.el.dataset.side = String(i);
        this.host.appendChild(c.el);
        c._sig = '';
      }
      c.el.style.display = '';
      c.el.style.left = `${v.x}px`;
      c.el.style.top = `${H - v.y - v.h}px`;
      c.el.style.width = `${v.w}px`;
      c.el.style.height = `${v.h}px`;
      /* HER colour, read off the kitten. `styleCss(i)` was a seat number
         standing in for a style index and came out wrong the moment anybody
         used the character picker — see `cssFor` in core/palette.js. */
      c.el.style.setProperty('--me', cssFor(this.game.players[i]?.style));
      this._paintCard(i);
    }
  }

  /** Rebuild one card's markup, but only when something on it changed — same
   *  guard, and the same reason, as `ProfileScreen._paint`. */
  _paintCard(index) {
    const c = this.cards[index];
    const p = this.game.players[index];
    if (!c.el || !p) return;
    const K = this.game.kotodama;
    const sig = [
      c.state, c.i, p.powerOrbs.join(','), p.score,
      POWER_ORBS.map((s) => K?.stock?.[s.id] ?? 0).join(','),
    ].join('#');
    if (sig === c._sig) return;
    c._sig = sig;
    c.el.innerHTML = c.state === 'choose'
      ? this._chooseMarkup(index) : this._lookMarkup(index);
    /* WALK THE CURSOR BACK INTO VIEW. Nine orbs do not fit in a quarter pane
       at a readable size (see `.pc-list` in style.css), and the markup is
       rebuilt from scratch on every change — so the list is scrolled to the
       top again on the very frame her cursor moved off the bottom of it.
       `block: 'nearest'` so a cursor already on screen does not jump. */
    c.el.querySelector('.cursor')?.scrollIntoView({ block: 'nearest' });
  }

  _chooseMarkup(index) {
    const c = this.cards[index];
    const p = this.game.players[index];
    const rows = CHOICES.map((ch, k) => `
      <div class="pc-row${k === c.i ? ' cursor' : ''}" data-side="${index}" data-row="${k}">
        <b>${ch.title}</b>
        <div class="pc-dim">${ch.blurb}</div>
      </div>`).join('');
    return `<div class="pc-inner">
      <div class="pc-head"><span class="pc-who">${p.name}</span> AT THE DEALER</div>
      ${rows}
      <div class="pc-foot">JUMP <b>choose</b> · INTERACT <b>leave</b></div>
    </div>`;
  }

  /**
   * Her orbs, and the whole shelf with what each one does.
   *
   * "FAIRLY ZOOMED IN, LIKE IT IS USUALLY ON THE PLAYER INVENTORY SCREEN." A
   * quarter of a 1080p screen is 960x540 and this is a reading surface, so the
   * type is sized off the pane rather than off the window — see `.pane-card`
   * in style.css, which sets its own font size from container units. Eight
   * rows do not fit at that size, which is why the list scrolls the cursor
   * into view rather than shrinking to fit: a card you can read four rows of
   * beats a card you can read none of.
   */
  _lookMarkup(index) {
    const c = this.cards[index];
    const p = this.game.players[index];
    const K = this.game.kotodama;
    const owned = p.powerOrbs;

    /* HER EIGHT SLOTS, FILLED OR NOT — the same argument the trade screen's
       card makes: three orbs in a row of eight says "five more" in a way three
       orbs on their own cannot. */
    const slots = [];
    for (let k = 0; k < MAX_EQUIPPED; k++) {
      const spec = owned[k] ? ORB_BY_ID[owned[k]] : null;
      slots.push(spec
        ? `<i class="pc-slot full" style="--orb:#${spec.color.toString(16).padStart(6, '0')}">${spec.kanji}</i>`
        : '<i class="pc-slot"></i>');
    }

    const rows = POWER_ORBS.map((spec, k) => {
      const n = owned.filter((x) => x === spec.id).length;
      const stock = K?.stock?.[spec.id] ?? 0;
      return `<div class="pc-orb${k === c.i ? ' cursor' : ''}${n ? ' owned' : ''}${stock ? '' : ' out'}"
        style="--orb:#${spec.color.toString(16).padStart(6, '0')}"
        data-side="${index}" data-row="${k}">
        <i class="pc-dot">${spec.kanji}</i>
        <div class="pc-orb-main">
          <b>${spec.name}</b> <span class="pc-tag">${spec.label}</span>
          <div class="pc-dim">${n ? spec.detail(n) : spec.blurb}</div>
        </div>
        <div class="pc-orb-num">
          <div>${n ? `wearing ${n}` : '—'}</div>
          <div class="pc-dim">${stock ? `shelf ${stock}` : 'sold out'}</div>
        </div>
      </div>`;
    }).join('');

    return `<div class="pc-inner">
      <div class="pc-head"><span class="pc-who">${p.name}</span>
        · <b>${p.score}</b> points · ${owned.length}/${MAX_EQUIPPED} worn</div>
      <div class="pc-slots">${slots.join('')}</div>
      <div class="pc-list" data-list="${index}">${rows}</div>
      <div class="pc-foot">buy <b>${K?.price ?? '—'}</b> · sell <b>${K?.sellPrice ?? '—'}</b>
        — INTERACT <b>back</b></div>
    </div>`;
  }

  /**
   * The same card, reachable with a thumb.
   *
   * DELEGATED ON THE HOST for the same reason the trade screen delegates on its
   * panel: `_paintCard` replaces the whole card whenever anything changes, so
   * per-element listeners would be rebound on every repaint and leak.
   *
   * A tap is "move THAT side's cursor there, then press JUMP" — nothing here
   * re-implements a rule, so the two paths cannot drift apart.
   */
  _bindTaps() {
    if (!this.host) return;
    this.host.addEventListener('pointerdown', (e) => {
      const row = e.target.closest?.('[data-row]');
      if (!row) return;
      const i = Number(row.dataset.side);
      const k = Number(row.dataset.row);
      const c = this.cards[i];
      if (!c?.state || !Number.isFinite(k)) return;
      e.preventDefault();
      if (c.i !== k) { c.i = k; this.game.audio?.play('menu'); }
      if (c.state === 'choose') this._choose(i);
      this._paintCard(i);
    });
  }
}
