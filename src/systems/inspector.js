import { POWER_ORBS, ORB_BY_ID, MAX_EQUIPPED, countsOf } from '../entities/powerorb.js';
import { MAX_PLAYERS, cssFor } from '../core/palette.js';
import { onTap } from '../core/tap.js';
import { cardRect } from '../core/split.js';

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
     3. CHARACTER PROFILE      -> the trade window, everybody, world frozen

   THE THIRD ONE WAS ONLY REACHABLE FROM THE PAUSE MENU. Trading orbs with
   each other is the thing four kittens standing at one stall are most likely
   to want, and asking them to pause the game and find a menu item to do it
   put a wall between the counter and the screen next to it. Same screen, same
   `ProfileScreen.open('profile')` the pause menu calls — this is a second door
   onto it, not a second copy of it.

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

/** The three things the dealer can be asked for. Index into this is the cursor
 *  on the chooser, so the order is the order on screen.
 *
 *  ORDER MATTERS AND IT IS NOT ALPHABETICAL: the two that stop everybody are
 *  the outer rows and the one that stops nobody is in the middle, so the row
 *  a girl lands on by nudging once is never the one that freezes her sisters.
 *  The cursor opens on row 0 because that is where it was before this row
 *  existed, and moving it would change what an already-learned press does. */
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
  {
    key: 'profile',
    title: 'CHARACTER PROFILE — TRADE WINDOW',
    blurb: 'Swap orbs with each other. Everybody stops and every player '
      + 'gets their own cursor.',
  },
];

/** The three states that are Payne's card rather than the dealer's. Her card
 *  is THIS card — same host, same pane, same pad rules — because every rule
 *  `#pane-cards` has learned about a phone (the stacking order, the pad going
 *  dim behind it, the way out on the card) is a rule her card needs too, and a
 *  second host would have had to learn them all again. What she SAYS and what
 *  her rows DO live in systems/payne.js; this file only drives the cursor. */
const PAYNE_STATES = new Set(['payne', 'payneQuests', 'payneTrick']);
const isPayne = (state) => PAYNE_STATES.has(state);

/** One player's card. Never shared; there is one of these per seat. */
class Card {
  constructor() {
    /** null | 'choose' | 'look' | 'payne' | 'payneQuests' | 'payneTrick' */
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

  /**
   * Put a card back up exactly where it was, without a sound.
   *
   * Only the trade window uses this, on its way out — see `_choose`. Silent
   * because `ProfileScreen.close` has already played the menu blip for this
   * press, and two in one frame reads as a double click rather than as a step
   * back. Refuses if she has left the game while the window was up: a card
   * over a pane that no longer belongs to anybody is a rectangle nobody can
   * dismiss, which is the same rule `update` already enforces.
   */
  reopen(index, row = 0, state = 'choose') {
    const c = this.cards[index];
    if (!c || c.state || !this.game.players[index]) return;
    /* WHICHEVER CARD SHE CAME FROM. The trade window is reachable from the
       dealer AND from Payne, and BACK out of it lands on the one she opened
       it from — the same two-layers-in-one-press bug the dealer had, the
       other way round. */
    c.state = state === 'payne' ? 'payne' : 'choose';
    c.i = Math.max(0, Math.min(row, this._rowCount(index) - 1));
    c._sig = '';
  }

  /**
   * Open Payne's card for one kitten — she has walked up to her and pressed
   * INTERACT. The same card the dealer's chooser is, in her pane, with her pad.
   */
  openPayne(index) {
    const c = this.cards[index];
    const p = this.game.players[index];
    if (!c || c.state || !p || !this.game.payne) return;
    c.state = 'payne';
    c.i = 0;
    c._sig = '';
    this.game.audio?.play('menu');
    this.game.payne.greet(p);
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

  /** Take down this kitten's card only if it is PAYNE's - her Goblin Sweep
   *  ends the conversation, and must not close a dealer's card the kitten
   *  opened after walking off. No BYE: the sweep is the goodbye. */
  closePayne(index) {
    if (isPayne(this.cards[index]?.state)) this.closeOne(index);
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
    /* EACH OF THEM SPENDS THE PRESS IT ANSWERED. One press is one answer to
       one question, and this card is not the last thing in the frame to ask:
       the kitten loop runs after `Inspector.update`, and the frame a card
       CLOSES is a frame where `busy` has just gone false, so her real pad —
       not `DEAD_PAD` — is handed to `Player.update` with the press still on
       it. Closing a card would swing her katana, or walk her onto a mount.
       `consume` marks the edge spent by setting prev to held, so `down()` goes
       on telling the truth about a button she really is still holding.
       Optional-called because `world-check` drives this with hand-made pads. */
    if (pad.pressed('start')) { pad.consume?.('start'); this.closeOne(index); return; }
    if (pad.pressed('interact')) {
      pad.consume?.('interact');
      this._back(index);
      return;
    }
    if (pad.pressed('jump')) { pad.consume?.('jump'); this._choose(index); }
  }

  /**
   * INTERACT, or a tap on the card's own BACK button: out one level, then shut.
   *
   * ONE BODY FOR BOTH, so the button and the press cannot come to mean two
   * different things. Reported from a phone: "we need a way to click 'back'
   * when on these pages. The Action button can do it, but it is hidden behind
   * the UI." It is, and on purpose — `#pane-cards` sits ABOVE the pad while a
   * card is up (z 8 against 7, see style.css) so that the stick's catchment
   * stops swallowing the drags meant for the shelf, and the face cluster is in
   * the bottom-right corner of exactly the pane a card covers. Lifting the
   * button back over the card would re-open that bug; the way out belongs ON
   * the card instead, where the thing it closes is.
   */
  _back(index) {
    const c = this.cards[index];
    if (!c?.state) return;
    if (c.state === 'payneQuests' || c.state === 'payneTrick') {
      /* Back to her three questions, with the cursor on the row that got her
         here — so a second press of JUMP does the same thing again. */
      c.i = c.state === 'payneQuests' ? 0 : 3;
      c.state = 'payne';
      c._sig = '';
      this.game.audio?.play('menu');
      return;
    }
    if (c.state === 'payne') {
      const p = this.game.players[index];
      if (p) this.game.payne?.choose(p, 'bye');
      this.closeOne(index);
      return;
    }
    if (c.state === 'look') {
      c.state = 'choose';
      c.i = 1;
      c._sig = '';
      this.game.audio?.play('menu');
    } else this.closeOne(index);
  }

  /** JUMP, or a tap on a row. */
  _choose(index) {
    const c = this.cards[index];
    if (isPayne(c.state)) { this._choosePayne(index); return; }
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
    /* THE TRADE WINDOW IS THE SAME SCREEN THE PAUSE MENU OPENS, and it takes
       every card down for the same reason the counter does — it freezes the
       world for all four of them.

       `fromPause` STAYS FALSE, which is the one thing that differs from the
       pause-menu route and it is not cosmetic: opened from the world, closing
       has to hand the frame back or the first tick afterwards is however long
       they spent trading, and every kitten teleports. `ProfileScreen.close`
       does that only when `fromPause` is false. */
    if (pick.key === 'profile') {
      /* AND IT REMEMBERS THE CARD IT CAME FROM. Closing the trade window used
         to leave nothing behind, because `closeAll` had already taken her
         chooser down — so BACK out of the profile read as BACK out of the
         dealer, two layers in one press, and reported as exactly that. The
         row goes with the seat so the cursor comes back where she left it
         rather than on TRADE WITH THE DEALER, which is the row that stops
         everybody. START still drops the lot; see `ProfileScreen.close`. */
      const row = c.i;
      this.closeAll();
      this.game.profile.open('profile', { backTo: { index, row } });
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

  /** JUMP on Payne's card. Her rows decide what happens; the one row that is
   *  a hand-over — the trade window — is done here, the dealer's way. */
  _choosePayne(index) {
    const c = this.cards[index];
    const p = this.game.players[index];
    const P = this.game.payne;
    if (!p || !P) return;
    if (c.state === 'payneTrick') return;
    let key;
    if (c.state === 'payneQuests') key = P.questAct(c.i);
    else key = P.rows(p)[c.i]?.key;
    if (!key) return;
    if (key === 'back') { this._back(index); return; }
    if (key === 'profile') {
      /* THE SAME DOOR THE DEALER HAS ONTO IT, and the same reason every card
         comes down: it freezes the world for everybody. It remembers her card
         so BACK lands here — see `reopen`. */
      const row = c.i;
      this.closeAll();
      this.game.profile.open('profile', { backTo: { index, row, state: 'payne' } });
      return;
    }
    const next = P.choose(p, key);
    this.game.audio?.play('menu');
    if (!next) { this.closeOne(index); return; }
    if (next !== c.state) c.i = 0;
    c.state = next;
    c._sig = '';
  }

  _rowCount(index) {
    const c = this.cards[index];
    if (isPayne(c.state)) {
      const p = this.game.players[index];
      return p && this.game.payne ? this.game.payne.rowCount(p, c.state) : 0;
    }
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
      /* ON A PHONE, NEVER MORE THAN A SIDE-BY-SIDE HALF. The card is sized off
         the box it is in, so a lone kitten's whole-screen box printed it at
         17px — "too zoomed in... user can't see most of the orbs". `cardRect`
         in core/split.js hands her the rectangle two side-by-side players get,
         centred in her pane, and everything on the card follows from it. */
      const r = cardRect(v, W, H, !!this.game.device?.touchPrimary);
      if (!c.el) {
        c.el = document.createElement('div');
        c.el.className = 'pane-card';
        c.el.dataset.side = String(i);
        this.host.appendChild(c.el);
        c._sig = '';
      }
      c.el.style.display = '';
      c.el.style.left = `${r.x}px`;
      c.el.style.top = `${H - r.y - r.h}px`;
      c.el.style.width = `${r.w}px`;
      c.el.style.height = `${r.h}px`;
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
    const P = this.game.payne;
    /* HER CARD CHANGES WITH WHAT SHE IS SAYING AND WITH THE WORLD — a cane
       cut moves the NEXT line, a sister riding Ryuuseki changes a row — so
       her half of the signature is the step and the words, not the orbs. */
    const pay = isPayne(c.state) && P
      ? [P.speaking(p) ?? '', JSON.stringify(P.ledger(p)), P.step(p)?.where ?? '',
        P.revealed, (this.game.players ?? []).map((q) => q?.feats?.got?.length ?? 0).join(',')].join('|')
      : '';
    const sig = [
      c.state, c.i, p.powerOrbs.join(','), p.score,
      POWER_ORBS.map((s) => K?.stock?.[s.id] ?? 0).join(','), pay,
    ].join('#');
    if (sig === c._sig) return;
    c._sig = sig;
    c.el.innerHTML = isPayne(c.state) && P
      ? P.markup(index, c.state, c.i, (i, w) => this._backButton(i, w))
      : c.state === 'choose' ? this._chooseMarkup(index) : this._lookMarkup(index);
    if (isPayne(c.state)) P?.drawFace(c.el.querySelector('.pn-face'));
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
      <div class="pc-foot">${this._backButton(index, 'LEAVE')}
        <span>JUMP <b>choose</b> · INTERACT <b>leave</b></span></div>
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
    /* AND THE ONES THAT MATCH THE CURSOR ARE LIT. Reported from play: "it just
       shows the kanji character and colour, and it's hard to know which one
       relates to which ability." The row under the cursor says what an orb
       DOES in words; these say what she is WEARING in kanji; and nothing
       joined the two, so reading her own loadout meant learning eight
       characters first. Lighting the match turns the top row into an answer to
       the row she is looking at. */
    const lit = POWER_ORBS[c.i]?.id ?? null;
    const slots = [];
    let anyLit = false;
    for (let k = 0; k < MAX_EQUIPPED; k++) {
      const spec = owned[k] ? ORB_BY_ID[owned[k]] : null;
      const on = !!spec && spec.id === lit;
      if (on) anyLit = true;
      slots.push(spec
        ? `<i class="pc-slot full${on ? ' lit' : ''}" style="--orb:#${spec.color.toString(16).padStart(6, '0')}">${spec.kanji}</i>`
        : '<i class="pc-slot"></i>');
    }

    /* THE WHOLE SET, so 壁 Ward's row can print the block length she actually
       has rather than the shipped one — it grows with the 守 Long Guard orbs
       beside it. Every other spec ignores the second argument. */
    const counts = countsOf(owned);
    const rows = POWER_ORBS.map((spec, k) => {
      const n = owned.filter((x) => x === spec.id).length;
      const stock = K?.stock?.[spec.id] ?? 0;
      /* HER OWN PRICE ON HER OWN ROW WHEN IT IS NOT THE SHELF PRICE. The
         footer prints the ordinary buy/sell pair and that is true of eight of
         the nine kinds; the ninth says so here, because a card that showed
         only the common figure would be quietly wrong about the one orb whose
         price is the thing worth knowing about it. */
      const cost = K?.priceOf?.(spec.id) ?? K?.price ?? 0;
      const rare = K?.price != null && cost !== K.price
        ? `<div class="pc-rare">RARE ${cost}</div>` : '';
      return `<div class="pc-orb${k === c.i ? ' cursor' : ''}${n ? ' owned' : ''}${stock ? '' : ' out'}"
        style="--orb:#${spec.color.toString(16).padStart(6, '0')}"
        data-side="${index}" data-row="${k}">
        <i class="pc-dot">${spec.kanji}</i>
        <div class="pc-orb-main">
          <b>${spec.name}</b> <span class="pc-tag">${spec.label}</span>
          <div class="pc-dim">${n ? spec.detail(n, counts) : spec.blurb}</div>
        </div>
        <div class="pc-orb-num">
          <div>${n ? `wearing ${n}` : '—'}</div>
          ${rare}
          <div class="pc-dim">${stock ? `shelf ${stock}` : 'sold out'}</div>
        </div>
      </div>`;
    }).join('');

    return `<div class="pc-inner">
      <div class="pc-head"><span class="pc-who">${p.name}</span>
        · <b>${p.score}</b> points · ${owned.length}/${MAX_EQUIPPED} worn</div>
      <div class="pc-slots${anyLit ? ' picking' : ''}">${slots.join('')}</div>
      <div class="pc-list" data-list="${index}">${rows}</div>
      <div class="pc-foot">${this._backButton(index, 'BACK')}
        <span>buy <b>${K?.price ?? '—'}</b> · sell <b>${K?.sellPrice ?? '—'}</b>
        — INTERACT <b>back</b></span></div>
    </div>`;
  }

  /**
   * The way out, as a thing you can touch.
   *
   * IT SAYS WHAT IT DOES, per the sixth non-negotiable: LEAVE on the chooser,
   * where it closes the card, and BACK on her orbs, where it returns to the
   * three choices. Drawn on EVERY device, not only a phone — a mouse had no way
   * out of this card either, and a control that exists on one kind of machine
   * and not the other is how the two drift.
   */
  _backButton(index, word) {
    return `<button type="button" class="pc-back" data-back="${index}">◀ ${word}</button>`;
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
   *
   * AND A TAP IS A PRESS AND A RELEASE IN ONE PLACE. This was bound to
   * `pointerdown` and called `preventDefault`, which is both halves of the
   * report: "when scrolling up/down, it is also selecting the orbs", because
   * the handler had already fired before the flick existed — and the flick
   * then scrolled nothing, because `preventDefault` on a `pointerdown` cancels
   * the scroll it was being mistaken for. `.pc-list` has been a scroller since
   * a phone could reach this card; it has simply never been scrollable.
   *
   * `onTap` IS SHARED, not four lines here, because the note was general:
   * "this should apply on all screens that have scrolling and clickable UI
   * elements". See core/tap.js — the dealer's counter uses its other half.
   */
  _bindTaps() {
    if (!this.host) return;
    onTap(this.host, (target) => {
      /* BACK FIRST. It sits in the foot, which is not a row, so the order
         only matters if a future layout ever nests one inside the other — and
         then the button has to win, because it is the way out. */
      const back = target.closest?.('[data-back]');
      if (back) {
        const i = Number(back.dataset.back);
        if (this.cards[i]?.state) { this._back(i); if (this.cards[i].state) this._paintCard(i); }
        return;
      }
      const row = target.closest?.('[data-row]');
      if (!row) return;
      const i = Number(row.dataset.side);
      const k = Number(row.dataset.row);
      const c = this.cards[i];
      if (!c?.state || !Number.isFinite(k)) return;
      if (c.i !== k) { c.i = k; this.game.audio?.play('menu'); }
      if (c.state === 'choose' || isPayne(c.state)) this._choose(i);
      this._paintCard(i);
    });
  }
}
