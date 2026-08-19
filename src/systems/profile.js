import { POWER_ORBS, ORB_BY_ID, ORB_IDS, MAX_EQUIPPED } from '../entities/powerorb.js';
import { MAX_PLAYERS } from '../core/palette.js';

/* ---------------------------------------------------------------------------
   THE CHARACTER PROFILE — inventory, trading, and the dealer's counter.

   Two screens out of one class, because they are the same screen with a
   different second column: your eight slots on the left, and either your
   sister's eight or the dealer's shelf on the right.

   IT DOES NOT GO THROUGH `MenuNav`, AND THAT IS THE WHOLE REASON IT EXISTS AS
   ITS OWN FILE. Every other menu in this game merges both pads into ONE cursor
   on purpose — there is one screen, and making player 1 the only one who can
   press RESUME locks the other girl out of her own pause menu. A trade is the
   one surface where that is exactly wrong: the brief is that neither kitten
   can be made to trade against her will, and consent cannot be expressed
   through a cursor both players are pushing. So this screen reads the two pads
   SEPARATELY, gives each girl her own highlight in her own colour, and will
   not move an orb until both have pressed confirm on their own side.

   `MenuNav` is kept off it by listing these panels first in its own PANELS
   array: it finds them, finds no `.menu-btn` inside, reports that it does not
   own the input, and gets out of the way. One place, rather than a second
   copy of "which panel is up" living here.

   THREE BUTTONS, ONE MEANING EACH.
     jump      pick / unpick the orb you are offering
     attack    confirm — and when both have confirmed, the swap happens
     interact  back out: your confirm, then your offer, then the screen
   A fourth would be a fourth thing to explain to a nine-year-old, and the two
   things this screen has to teach are "that one is mine" and "we both have to
   say yes".
--------------------------------------------------------------------------- */

/** Stick deflection before a nudge counts, and how fast a held stick repeats. */
const NAV_DEAD = 0.55;
const REPEAT_DELAY = 0.34;
const REPEAT_RATE = 0.12;

/** Per-player cursor state. One of these each; never shared. */
class Side {
  constructor() {
    this.i = 0;
    this.offer = null;   // index into her own orb list, or null for "nothing"
    /** Points she is putting on the table. Zero means she is offering none. */
    this.points = 0;
    this.ready = false;
    this.hold = 0;
    this.repeatT = 0;
  }

  reset() {
    this.offer = null;
    this.points = 0;
    this.ready = false;
    this.hold = 0;
  }
}

/** How much one nudge of the stick moves a points offer. Coarse on purpose:
 *  the numbers here run to thousands and a nine-year-old is not going to hold
 *  a stick sideways two hundred times to hand over a fair price. */
const POINT_STEP = 50;

export class ProfileScreen {
  constructor(game) {
    this.game = game;
    /** null | 'profile' | 'shop' */
    this.mode = null;
    /** Which kitten opened the shop. Both drive the profile screen. */
    this.shopper = null;
    /** True when it was opened from the pause menu, so closing goes back
     *  there rather than dropping the girls straight into the world. */
    this.fromPause = false;
    /* ONE CURSOR PER PLAYER, still never shared — the whole argument for this
       screen having its own input path is that consent cannot be expressed
       through a cursor two people are pushing, and that is more true with four
       of them, not less. */
    this.sides = Array.from({ length: MAX_PLAYERS }, () => new Side());
    this._sig = '';
    this._flash = '';
    this._flashT = 0;

    this.el = document.getElementById('panel-profile');
    this.body = document.getElementById('kd-body');
    this.title = document.getElementById('kd-title');
    this.help = document.getElementById('kd-help');
    this.actions = document.getElementById('kd-actions');
    this._bindTaps();
  }

  /**
   * The same screen, reachable with a thumb.
   *
   * DELEGATED ON THE PANEL, because `_paint` replaces the whole card markup
   * whenever anything changes — per-element listeners would be rebound on every
   * repaint and leak. Same pattern, and same reason, as the debug panel.
   *
   * EVERY TAP GOES THROUGH THE FUNCTION THE PAD ALREADY CALLS. A tap on an orb
   * is "move this side's cursor there, then press JUMP"; a tap on +/- is the
   * stick being pushed. Nothing here re-implements a trade rule, so the rules
   * that protect a girl from being traded against her will — picking a new orb
   * clears her confirm, changing the points clears it too — hold for a thumb
   * without being written down a second time.
   */
  _bindTaps() {
    if (!this.el || this.el._bound) return;
    this.el._bound = true;
    this.el.addEventListener('click', (e) => {
      if (!this.mode) return;
      const close = e.target.closest('#kd-close');
      if (close) { this.close(); return; }

      const act = e.target.closest('[data-act]');
      if (act) {
        const i = Number(act.dataset.side);
        if (act.dataset.act === 'offer') this._offerHere(i);
        else if (act.dataset.act === 'confirm') this._confirmHere(i);
        else if (act.dataset.act === 'buy') this._buyHere(i);
        else if (act.dataset.act === 'sell') this._sellHere(i);
        this._sig = '';           // the flash line and the cards both moved
        this._paint();
        return;
      }

      const step = e.target.closest('[data-pts]');
      if (step) {
        this._bumpPoints(Number(step.dataset.side), Number(step.dataset.pts));
        this._sig = '';
        this._paint();
        return;
      }

      const cell = e.target.closest('[data-slot]');
      if (!cell) return;
      const index = Number(cell.dataset.side);
      const side = this.sides[index];
      if (!side) return;
      side.i = Number(cell.dataset.slot);
      /* A tap on the points row only moves the cursor there — the steppers are
         what change the number. Anywhere else it selects, which for a trade
         means offering, and `_offerHere` is the same body JUMP runs. */
      if (!this._onPoints(index)) this._offerHere(index);
      this._sig = '';
      this._paint();
    });
  }

  /**
   * Move a side's points offer by one step, clamped to what she actually has.
   *
   * Split out of the stick handler so the on-screen steppers cannot drift from
   * it — in particular the CLEARED CONFIRM, which is a consent rule and not a
   * detail: a girl who agreed to hand over 200 and then dialled it to 800 has
   * not agreed to that.
   */
  _bumpPoints(index, dir) {
    const side = this.sides[index];
    if (!side) return;
    const was = side.points;
    side.points = Math.max(0, Math.min(
      this.game.players[index]?.score ?? 0,
      side.points + Math.sign(dir) * POINT_STEP
    ));
    if (side.points !== was) { side.ready = false; this.game.audio?.play('menu'); }
  }

  get active() { return this.mode !== null; }

  /* -------------------------------- open --------------------------------- */

  open(mode, { shopper = null, fromPause = false } = {}) {
    this.mode = mode;
    this.shopper = shopper;
    this.fromPause = fromPause;
    for (const s of this.sides) s.reset();
    this.sides.forEach((s, i) => {
      s.i = Math.min(s.i, Math.max(0, this._rowCount(i) - 1));
    });
    this._sig = '';
    this.el.classList.remove('hidden');
    this.game.audio?.play('menu');
    this._paint();
  }

  close() {
    this.mode = null;
    this.shopper = null;
    this.el.classList.add('hidden');
    this.game.audio?.play('menu');
    /* Opened from the world, closing has to hand the frame back or the first
       tick after the shop is however long the girl spent in it — every kitten
       teleports and every dragon jumps. Same trap `setPaused` avoids. */
    if (!this.fromPause) this.game.clock.getDelta();
  }

  /* ------------------------------- input --------------------------------- */

  update(dt) {
    if (!this.mode) return;
    this._flashT = Math.max(0, this._flashT - dt);

    const pads = this.game.input.players;
    for (let i = 0; i < this.game.players.length; i++) {
      if (this.mode === 'shop' && this.game.players[i] !== this.shopper) continue;
      this._drive(i, pads[i], dt);
      if (!this.mode) return;      // she closed it
    }

    /* THE SWAP IS CHECKED AFTER BOTH PADS HAVE BEEN READ, not inside one of
       them. Firing it from whoever pressed second means the trade happens on
       her frame with her side's state and the other girl's confirm read one
       frame stale — which is invisible 99 times and produces one baffling
       failed trade on the hundredth. */
    if (this.mode === 'profile') this._maybeTrade();
    this._paint();
  }

  _drive(index, pad, dt) {
    if (!pad) return;
    const side = this.sides[index];
    const rows = this._rowCount(index);

    /* ON THE POINTS ROW, LEFT AND RIGHT CHANGE THE AMOUNT and up and down
       still move the cursor. Splitting the axes is what lets one row carry a
       value without a second control to explain — the same trick `MenuNav`
       uses on a `<select>`, and the reason a points offer needs no extra
       button. Everywhere else both axes move the cursor, exactly as before. */
    const onPoints = this._onPoints(index);
    const raw = (!onPoints && Math.abs(pad.mx) > NAV_DEAD) ? Math.sign(pad.mx)
      : Math.abs(pad.my) > NAV_DEAD ? Math.sign(pad.my) : 0;
    let step = 0;
    if (raw === 0) side.hold = 0;
    else if (side.hold !== raw) { side.hold = raw; side.repeatT = REPEAT_DELAY; step = raw; }
    else {
      side.repeatT -= dt;
      if (side.repeatT <= 0) { side.repeatT = REPEAT_RATE; step = raw; }
    }
    if (step && rows > 0) {
      side.i = (side.i + step + rows) % rows;
      this.game.audio?.play('menu');
    }

    if (onPoints && Math.abs(pad.mx) > NAV_DEAD) {
      side.pointHold = (side.pointHold ?? 0) - dt;
      if (side.pointHold <= 0) {
        side.pointHold = side.points === 0 ? REPEAT_DELAY : REPEAT_RATE;
        /* Shared with the on-screen steppers — see `_bumpPoints`, which also
           carries the rule that moving the offer clears her confirm. */
        this._bumpPoints(index, pad.mx);
      }
    } else {
      side.pointHold = 0;
    }

    if (pad.pressed('start')) { this.close(); return; }

    if (this.mode === 'shop') this._shopButtons(index, pad);
    else this._tradeButtons(index, pad, side);
  }

  _tradeButtons(index, pad, side) {
    const player = this.game.players[index];
    const owned = player.powerOrbs;

    if (pad.pressed('jump')) this._offerHere(index);
    if (pad.pressed('attack')) this._confirmHere(index);

    if (pad.pressed('interact')) {
      if (side.ready) side.ready = false;
      else if (side.offer !== null) side.offer = null;
      else if (side.points > 0) side.points = 0;
      else this.close();
    }
  }

  /** JUMP, or a tap on an orb: offer the row this side's cursor is on. */
  _offerHere(index) {
    const player = this.game.players[index];
    const side = this.sides[index];
    if (!player || !side) return;
    const owned = player.powerOrbs;
    if (this._onPoints(index)) {
      /* The points row is a no-op by design: the amount IS the offer, so there
         is nothing to toggle. Zero means offering none. */
      this._say(side.points > 0
        ? `${player.name} is offering ${side.points} points`
        : 'Use − and + to offer points');
      this.game.audio?.play('menu');
      return;
    }
    if (!owned.length) {
      this._say(`${player.name} has nothing to offer yet`);
      this.game.audio?.play('deny');
      return;
    }
    /* Picking a new orb CLEARS HER CONFIRM. A girl who has said yes to swapping
       her Ward and then moves the offer to her Gale has not agreed to that
       trade, and letting the tick survive the change is precisely the "traded
       against her will" the brief rules out. */
    side.offer = side.offer === side.i ? null : side.i;
    side.ready = false;
    this.game.audio?.play('menu');
  }

  /** ATTACK, or a tap on CONFIRM: this side says yes. */
  _confirmHere(index) {
    const side = this.sides[index];
    if (!side) return;
    /* SOMEBODY has to be offering something — asked of every side rather than
       of the other one, because with four kittens on this screen the two who
       are trading are whichever two confirm. */
    const anything = this.sides.slice(0, this.game.players.length)
      .some((sd) => sd.offer !== null || sd.points > 0);
    if (!anything) {
      this._say('Somebody has to offer something first');
      this.game.audio?.play('deny');
      return;
    }
    side.ready = !side.ready;
    this.game.audio?.play(side.ready ? 'score' : 'menu');
  }

  /** JUMP, or a tap on BUY. */
  _buyHere(index) {
    const player = this.game.players[index];
    const K = this.game.kotodama;
    const id = ORB_IDS[this.sides[index].i];
    const why = K.buyRefusal(player, id);
    if (why) { this._say(why); this.game.audio?.play('deny'); }
    else { K.buy(player, id); this._say(`Bought ${ORB_BY_ID[id].name}`); }
  }

  /** ATTACK, or a tap on SELL. */
  _sellHere(index) {
    const player = this.game.players[index];
    const K = this.game.kotodama;
    const id = ORB_IDS[this.sides[index].i];
    if (!player.powerOrbs.includes(id)) {
      this._say(`${player.name} has no ${ORB_BY_ID[id].name} to sell`);
      this.game.audio?.play('deny');
      return;
    }
    K.sell(player, id);
    this._say(`Sold ${ORB_BY_ID[id].name} for ${K.sellPrice}`);
  }

  /**
   * A trade fires when EXACTLY TWO players have confirmed.
   *
   * THAT IS THE TWO-PLAYER RULE GENERALISED, NOT A NEW ONE. With two kittens
   * "both have confirmed" and "exactly two have confirmed" are the same
   * sentence, so nothing about the game the girls know changes. With four it
   * answers the question a partner selector would otherwise have to ask —
   * WHO is trading with whom — using the thing they were already going to do,
   * and it keeps consent exactly where it was: the two people trading are the
   * two people who each said yes on their own controller.
   *
   * A THIRD CONFIRM IS REFUSED RATHER THAN GUESSED. Picking two out of three
   * would move an orb somebody agreed to give to a person she did not agree to
   * give it to, which is the one thing this screen exists to make impossible.
   */
  _maybeTrade() {
    const live = this.sides.slice(0, this.game.players.length);
    const ready = live.map((s, i) => (s.ready ? i : -1)).filter((i) => i >= 0);
    if (ready.length < 2) return;
    if (ready.length > 2) {
      this._say('Only two at a time — one of you un-confirm');
      return;
    }

    const [ia, ib] = ready;
    const A = this.sides[ia];
    const B = this.sides[ib];
    const pa = this.game.players[ia];
    const pb = this.game.players[ib];
    const aId = A.offer === null ? null : pa.powerOrbs[A.offer];
    const bId = B.offer === null ? null : pb.powerOrbs[B.offer];
    if (!aId && !bId && !A.points && !B.points) return;

    /* POINTS MOVE WITH THE ORBS OR NOT AT ALL. `kotodama.trade` is already
       atomic — it removes both orbs before giving either, so a swap into a
       full kitten cannot leave one of them a copy down — and points have to
       be inside that same all-or-nothing, or a refused orb swap still empties
       somebody's purse. Checked first, moved after. */
    const aPts = Math.min(A.points, pa.score);
    const bPts = Math.min(B.points, pb.score);

    if (this.game.kotodama.trade(pa, aId, pb, bId)) {
      if (aPts) { pa.score -= aPts; pb.score += aPts; }
      if (bPts) { pb.score -= bPts; pa.score += bPts; }
      if (aPts || bPts) {
        this.game.onScoreChanged?.(pa);
        this.game.onScoreChanged?.(pb);
      }
      const gave = (p, id, pts) => {
        const bits = [];
        if (id) bits.push(ORB_BY_ID[id].name);
        if (pts) bits.push(`${pts} points`);
        return bits.length ? `${p.name} gave ${bits.join(' + ')}` : null;
      };
      const parts = [gave(pa, aId, aPts), gave(pb, bId, bPts)].filter(Boolean);
      this._say(parts.join('  ·  '));
      this.game.toast(parts.join(' — '), pa.index);
      this.game.toast(parts.join(' — '), pb.index);
    } else {
      this._say('That would leave somebody carrying nine');
      this.game.audio?.play('deny');
    }
    for (const s of this.sides) s.reset();
  }

  _shopButtons(index, pad) {
    if (pad.pressed('jump')) this._buyHere(index);
    if (pad.pressed('attack')) this._sellHere(index);
    if (pad.pressed('interact')) this.close();
  }

  _say(text) {
    this._flash = text;
    this._flashT = 2.6;
  }

  _rowCount(index) {
    if (this.mode === 'shop') return ORB_IDS.length;
    /* HER CURSOR RANGES OVER WHAT SHE HAS, NOT OVER EIGHT SLOTS. Letting it
       land on an empty slot means the most common action on this screen —
       press jump to offer — does nothing most of the time, which reads as the
       controller not working rather than as an empty slot. */
    /* ...PLUS ONE ROW FOR POINTS, which is why this is not simply the orb
       count. Points are the other thing she can put on the table — a kitten
       who has been to the ring has some and a kitten who has not wants them —
       and they need somewhere for the cursor to land. It is the LAST row, so
       the orbs keep the positions they had. */
    return Math.max(1, this.game.players[index]?.powerOrbs.length ?? 0) + 1;
  }

  /** True when this side's cursor is on the points row rather than an orb. */
  _onPoints(index) {
    return this.mode === 'profile'
      && this.sides[index].i >= this._rowCount(index) - 1;
  }

  /* -------------------------------- paint -------------------------------- */

  /**
   * Redraw, but only when something changed.
   *
   * The signature is every value on screen. Rebuilding this markup every frame
   * at 138fps is what would make a menu the most expensive thing in the game —
   * and worse, it re-creates the elements under the CSS transitions, so the
   * cursor's glow restarts sixty times a second and stops looking like it is
   * anywhere. Same guard `MrSatan.setLine` uses, and for the same reason.
   */
  _paint() {
    const sig = this._signature();
    if (sig === this._sig) return;
    this._sig = sig;

    if (this.mode === 'shop') {
      this.title.textContent = 'KOTODAMA DEALER';
      this.body.innerHTML = this._shopMarkup();
      this.help.innerHTML = this._flashT > 0
        ? `<em>${this._flash}</em>`
        : 'JUMP <b>buy</b> · ATTACK <b>sell</b> · INTERACT <b>leave</b>';
    } else {
      this.title.textContent = 'CHARACTER PROFILE';
      this.body.innerHTML = this.game.players.map((p, i) => this._cardMarkup(p, i)).join('');
      this.help.innerHTML = this._flashT > 0
        ? `<em>${this._flash}</em>`
        : 'JUMP <b>offer this orb</b> · ATTACK <b>confirm</b> · INTERACT <b>back</b>'
          + ' — <b>both</b> must confirm';
    }
    this._paintActions();
  }

  /**
   * The footer's own buttons, and they are not a convenience.
   *
   * THIS PANEL COVERS THE TOUCH PAD. `.overlay` is z-index 20 and `#touch-pad`
   * is 7, so while this screen is up every on-screen button is underneath it —
   * JUMP, ATTACK and INTERACT are all drawn and all unreachable. On a phone that
   * left no way to offer, no way to confirm and no way out, which is exactly
   * what was reported. A pad player never noticed because a real controller is
   * not covered by anything.
   *
   * So the actions the pad would press live in the footer as real buttons, and
   * they call the same `_offerHere` / `_confirmHere` / `_buyHere` / `_sellHere`
   * the pad calls. Built only where they are needed: on a desktop the help line
   * already names the keys and a second row of buttons would be clutter.
   */
  _paintActions() {
    if (!this.actions) return;
    if (!this.game.device?.touchPrimary) { this.actions.innerHTML = ''; return; }
    const i = this._touchSide();
    const sig = `${this.mode}|${i}|${this.sides[i]?.ready}`;
    if (sig === this._actionSig) return;
    this._actionSig = sig;
    const btn = (act, label, cls = '') =>
      `<button type="button" class="kd-act ${cls}" data-act="${act}" data-side="${i}">${label}</button>`;
    this.actions.innerHTML = this.mode === 'shop'
      ? btn('buy', 'BUY') + btn('sell', 'SELL')
      : btn('offer', 'OFFER') + btn('confirm', this.sides[i]?.ready ? 'UNCONFIRM' : 'CONFIRM', 'go');
  }

  /**
   * Which side the on-screen pad drives.
   *
   * Asked of the input layer rather than assumed to be 0: the touch pad is
   * seated in a slot like any other device, and on a tablet with a keyboard
   * player 1 can be the keyboard. Falls back to 0, because a screen that
   * refuses to work is worse than one that guesses the only seat a phone has.
   */
  _touchSide() {
    const b = this.game.input?.bindings ?? [];
    const i = b.findIndex((x) => x?.touch);
    return i >= 0 ? i : 0;
  }

  _signature() {
    const K = this.game.kotodama;
    return [
      this.mode,
      this.game.players.map((p) => `${p.powerOrbs.join(',')}|${p.score}|${p.clan?.id ?? ''}`).join(';'),
      this.sides.map((s) => `${s.i}/${s.offer}/${s.points}/${s.ready}`).join(';'),
      this.mode === 'shop' ? ORB_IDS.map((id) => K.stock[id]).join(',') : '',
      this._flashT > 0 ? this._flash : '',
    ].join('#');
  }

  /** One kitten's column: who she is, what she is wearing, what she is offering. */
  _cardMarkup(player, index) {
    const side = this.sides[index];
    const owned = player.powerOrbs;
    const cls = `kd-card kd-p${index}`;

    /* EIGHT SLOTS ARE ALWAYS DRAWN, filled or not. The cap is a rule she has
       to be able to see coming: three orbs in a row of eight says "five more"
       in a way that three orbs on their own cannot, and it is the same
       argument the dragon-ball counter makes by printing "/ 7". */
    const slots = [];
    for (let k = 0; k < MAX_EQUIPPED; k++) {
      const id = owned[k];
      const spec = id ? ORB_BY_ID[id] : null;
      const on = [
        'kd-slot',
        spec ? 'full' : 'empty',
        k === side.i && k < owned.length ? 'cursor' : '',
        side.offer === k ? 'offered' : '',
      ].filter(Boolean).join(' ');
      const style = spec ? `style="--orb:#${spec.color.toString(16).padStart(6, '0')}"` : '';
      /* `data-side` / `data-slot` are what make this reachable with a thumb. A
         tap moves that side's cursor and offers the orb — the same two things
         the stick and JUMP do, routed through the same code, so a phone cannot
         end up with subtly different trade rules from a pad. */
      slots.push(`<div class="${on}" ${style} data-side="${index}" data-slot="${k}">`
        + `<span>${spec ? spec.kanji : ''}</span></div>`);
    }

    const here = owned[side.i] ? ORB_BY_ID[owned[side.i]] : null;
    const n = here ? owned.filter((x) => x === here.id).length : 0;
    const detail = here
      ? `<b>${here.name}</b> · ${here.label}<br><span class="kd-dim">${here.detail(n)}${n > 1 ? `  (x${n})` : ''}</span>`
      : '<span class="kd-dim">No Kotodama yet — go and find one.</span>';

    /* The points row, drawn as a row rather than as a slot: it is not one of
       the eight, and putting it in the grid would say it is. */
    const onPts = this._onPoints(index);
    /* THE STEPPERS ARE TOUCH-ONLY IN PRACTICE AND HARMLESS EVERYWHERE. On a pad
       the points row says "◀ ▶ to change" and the stick does it; a thumb has no
       stick to push while the trade screen is up, so the row carries its own
       two buttons. They call the same `_bumpPoints` the stick does. */
    const pointsRow = `<div class="kd-points${onPts ? ' cursor' : ''}" `
      + `data-side="${index}" data-slot="${this._rowCount(index) - 1}">`
      + `<span>POINTS</span>`
      + `<button class="kd-step" type="button" data-side="${index}" data-pts="-1">−</button>`
      + `<b>${side.points}</b>`
      + `<button class="kd-step" type="button" data-side="${index}" data-pts="1">+</button>`
      + `<span class="kd-dim">${onPts ? '◀ ▶ to change' : ''}</span></div>`;

    const offered = [];
    if (side.offer !== null) offered.push(ORB_BY_ID[owned[side.offer]]?.name ?? '—');
    if (side.points > 0) offered.push(`${side.points} points`);
    const state = side.ready
      ? '<span class="kd-ready">CONFIRMED</span>'
      : offered.length
        ? `offering <b>${offered.join(' + ')}</b>`
        : '<span class="kd-dim">offering nothing</span>';

    return `<div class="${cls}">
      <div class="kd-name">${player.name}</div>
      <div class="kd-meta">${player.clan?.name ?? 'no clan'} · ${player.score} pts
        · ${owned.length}/${MAX_EQUIPPED}</div>
      <div class="kd-slots">${slots.join('')}</div>
      ${this.mode === 'profile' ? pointsRow : ''}
      <div class="kd-detail">${detail}</div>
      <div class="kd-state">${state}</div>
    </div>`;
  }

  _shopMarkup() {
    const K = this.game.kotodama;
    const p = this.shopper;
    const side = this.sides[p.index];

    const rows = POWER_ORBS.map((spec, k) => {
      const stock = K.stock[spec.id] ?? 0;
      const mine = p.powerOrbs.filter((x) => x === spec.id).length;
      const cls = ['kd-row', k === side.i ? 'cursor' : '', stock ? '' : 'out']
        .filter(Boolean).join(' ');
      return `<div class="${cls}" style="--orb:#${spec.color.toString(16).padStart(6, '0')}"
        data-side="${p.index}" data-slot="${k}">
        <div class="kd-dot"><span>${spec.kanji}</span></div>
        <div class="kd-row-main">
          <b>${spec.name}</b> — ${spec.label}
          <div class="kd-dim">${spec.blurb}</div>
        </div>
        <div class="kd-row-num">
          <div>${stock ? `in stock ${stock}` : 'SOLD OUT'}</div>
          <div class="kd-dim">you have ${mine}</div>
        </div>
      </div>`;
    }).join('');

    return `<div class="kd-shop">
      <div class="kd-purse">${p.name} · <b>${p.score}</b> points
        · buy <b>${K.price}</b> · sell <b>${K.sellPrice}</b>
        · carrying ${p.powerOrbs.length}/${MAX_EQUIPPED}</div>
      ${rows}
    </div>`;
  }
}
