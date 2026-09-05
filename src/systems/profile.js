import { POWER_ORBS, ORB_BY_ID, ORB_IDS, MAX_EQUIPPED, countsOf } from '../entities/powerorb.js';
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
    /**
     * WHICH OF HER OWN SLOTS ARE ON THE TABLE — a SET of row indices, not one.
     *
     * It was a single index, and one orb at a time is the wrong shape for what
     * this screen is for: the thing the girls actually do here is the older
     * one handing the younger one a fistful of spares, and doing that one orb
     * at a time means agreeing to the same trade four times over. Four
     * questions is four chances to press the wrong button.
     *
     * A SET OF ROWS AND NOT A SET OF IDS, because she can be wearing two of
     * the same orb and offering one of them is a different sentence from
     * offering both. The rows are her own `powerOrbs` indices, so they are
     * only meaningful while her list has not changed under them — which is why
     * `reset` is called on every completed trade.
     */
    this.offers = new Set();
    /** Points she is putting on the table. Zero means she is offering none. */
    this.points = 0;
    this.ready = false;
    /**
     * The question this side is being asked right now, or null.
     *
     * `{ kind: 'buy'|'sell'|'trade', id, text }`. IT IS PER SIDE AND NOT A
     * PANEL, which is the whole reason this screen does not use the shared
     * `Confirm` dialog: that one is a single modal with a single cursor, and
     * the rule here is that only the girl being asked can answer. A modal over
     * a four-player trade screen would be answerable by whoever was nearest.
     */
    this.pending = null;
    /** She has answered the final trade question with yes. */
    this.sure = false;
    this.hold = 0;
    this.repeatT = 0;
    /**
     * Has this side's pad let go of everything since the screen opened?
     *
     * THE PRESS THAT OPENS A SCREEN MUST NOT ALSO PRESS SOMETHING ON IT.
     * Reported from play: choosing CHARACTER PROFILE with JUMP arrived here
     * with an orb already on the table, because the same jump edge was still
     * unspent when `update` ran later in the same frame and `_offerHere` took
     * it. `MenuNav` pays its presses now, which fixes that route at the
     * source — this is the belt to that pair of braces, and it covers the
     * routes a consume cannot: a button still HELD across the open (an edge
     * is one frame, a held thumb is not), and any future caller that opens
     * this screen without knowing it owes anything.
     *
     * `armT` is why a stuck button cannot lock a girl out of the trade
     * window. A vJoy half that latches a button down would otherwise never
     * release, so this side would never arm and she would sit in front of a
     * screen that ignores her — a rule that vanishes rather than degrades.
     * After ARM_GRACE the latch gives up: the opening edge is one frame old
     * and long gone by then, so there is nothing left for it to protect.
     */
    this.armed = false;
    this.armT = 0;
  }

  reset() {
    this.offers.clear();
    this.points = 0;
    this.ready = false;
    this.pending = null;
    this.sure = false;
    this.hold = 0;
  }

  /** Called by `open`, not by `reset` — a completed trade resets every side
   *  mid-screen and must not take her buttons away in the middle of it. */
  disarm() {
    this.armed = false;
    this.armT = 0;
  }
}

/** How much one nudge of the stick moves a points offer. Coarse on purpose:
 *  the numbers here run to thousands and a nine-year-old is not going to hold
 *  a stick sideways two hundred times to hand over a fair price. */
const POINT_STEP = 50;

/** Everything that DOES something on this screen. A side is armed once its pad
 *  is holding none of them — see `Side.armed`. */
/* SPRINT IS IN HERE BECAUSE IT DROPS ORBS NOW. It is a HELD button in play —
   a girl who runs to the stall arrives with her thumb still on it — so of
   everything on this screen it is the one most likely to be down at the moment
   the panel opens. See `Side.armed`. */
const ARM_ACTIONS = ['jump', 'attack', 'interact', 'mount', 'sprint', 'start'];
/** ...or after this long, whatever the pad is claiming. See `Side.armT`. */
const ARM_GRACE = 0.6;

export class ProfileScreen {
  constructor(game) {
    this.game = game;
    /** null | 'profile' | 'shop' */
    this.mode = null;
    /** Which kitten opened the shop. Both drive the profile screen. */
    this.shopper = null;
    /**
     * The seats currently shopping, by player index.
     *
     * THE COUNTER IS SHARED BUT NOT AUTOMATIC. Reported from four-player play:
     * one kitten opening the shop threw all four onto it, and three of them
     * sat there with dead sticks while she read prices. The other half of the
     * fix is the personal card (systems/inspector.js); this is the half that
     * says the shared screen is worth being on — press MOUNT and you get your
     * own cursor in your own colour and can buy your own orbs.
     *
     * IT IS OPT-IN AND NOT OPT-OUT. Everybody is on the screen either way —
     * it freezes the world, so there is nowhere else to be — but a kitten who
     * has not joined cannot spend her points by leaning on a stick, which is
     * the accident a four-way shared cursor surface invites.
     *
     * MOUNT IS THE JOIN BUTTON. `start` closes the screen, `jump` buys,
     * `attack` sells and `interact` leaves; mount is the one control this
     * screen does not already use, and Richard asked for "a not so often
     * pressed button".
     */
    this.joined = new Set();
    /** True when it was opened from the pause menu, so closing goes back
     *  there rather than dropping the girls straight into the world. */
    this.fromPause = false;
    /* ONE CURSOR PER PLAYER, still never shared — the whole argument for this
       screen having its own input path is that consent cannot be expressed
       through a cursor two people are pushing, and that is more true with four
       of them, not less. */
    this.sides = Array.from({ length: MAX_PLAYERS }, () => new Side());
    this._sig = '';
    /** Whose cursor a stick moved this frame, for `_followCursors`. */
    this._moved = null;
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
        else if (act.dataset.act === 'drop') this._dropHere(i);
        else if (act.dataset.act === 'yes') this._answerHere(i, true);
        else if (act.dataset.act === 'no') this._answerHere(i, false);
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
      /* THE SAME FREEZE THE STICK GETS — see the note in `_drive`. A thumb can
         reach a row while a question is up just as easily as a stick can, and
         the whole point of the lock is that the highlight cannot wander off
         the thing being asked about. YES and NO are `[data-act]` and were
         handled above, so this only blocks the wandering. */
      if (side.pending) return;
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
    if (side.points !== was) {
      side.ready = false;
      /* Same consent rule one step further along — see `_offerHere`. */
      side.sure = false;
      side.pending = null;
      this.game.audio?.play('menu');
    }
  }

  get active() { return this.mode !== null; }

  /* -------------------------------- open --------------------------------- */

  open(mode, { shopper = null, fromPause = false, backTo = null } = {}) {
    this.mode = mode;
    this.shopper = shopper;
    this.fromPause = fromPause;
    /* WHERE BACK GOES, or null for straight out to the world. Set only by
       `Inspector._choose`, which is the one route into this screen that has
       something underneath it — see `close`. */
    this.backTo = backTo;
    /* The kitten who walked up to the counter is in from the first frame; she
       asked for this screen and should not have to ask twice. */
    this.joined = new Set(shopper ? [shopper.index] : []);
    for (const s of this.sides) { s.reset(); s.disarm(); }
    this.sides.forEach((s, i) => {
      s.i = Math.min(s.i, Math.max(0, this._rowCount(i) - 1));
    });
    this._sig = '';
    this.el.classList.remove('hidden');
    this.game.audio?.play('menu');
    this._paint();
  }

  /**
   * @param {object} [o]
   * @param {boolean} [o.back]  false drops every layer instead of stepping
   *        back one. START passes it: that button is the way OUT of the whole
   *        screen and landing on the card she opened it from is not out.
   *        INTERACT steps back one layer, which is the rule `_tradeButtons`
   *        already follows inside this screen — ready, then offers, then
   *        points, then here.
   */
  close({ back = true } = {}) {
    const backTo = this.backTo;
    this.backTo = null;
    this.mode = null;
    this.shopper = null;
    this.joined.clear();
    this.el.classList.add('hidden');
    this.game.audio?.play('menu');
    /* Opened from the world, closing has to hand the frame back or the first
       tick after the shop is however long the girl spent in it — every kitten
       teleports and every dragon jumps. Same trap `setPaused` avoids. */
    if (!this.fromPause) this.game.clock.getDelta();
    /* AFTER the panel is down and the clock is square, so the card is put back
       over a game that is already running again. */
    if (back && backTo) this.game.inspector?.reopen(backTo.index, backTo.row);
  }

  /* ------------------------------- input --------------------------------- */

  update(dt) {
    if (!this.mode) return;
    this._flashT = Math.max(0, this._flashT - dt);

    const pads = this.game.input.players;
    for (let i = 0; i < this.game.players.length; i++) {
      if (this.mode === 'shop' && !this.joined.has(i)) {
        /* NOT SHOPPING YET — one button, and it is the only one she has.
           Read before `_drive` and instead of it, so the press that joins her
           cannot also be the press that buys something: she arrives with a
           cursor on row zero and no purchase behind her. */
        if (pads[i]?.pressed('mount')) this._join(i);
        continue;
      }
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

  /** She pressed MOUNT at the shared counter and now has her own cursor. */
  _join(index) {
    const p = this.game.players[index];
    if (!p || this.joined.has(index)) return;
    this.joined.add(index);
    /* HER CURSOR STARTS AT THE TOP, not wherever it was left by a trade screen
       three islands ago. `Side.reset` deliberately does not touch `i`, because
       on the trade screen keeping your place across a re-open is the friendly
       thing; joining a shop you were not on is a different event. */
    this.sides[index].reset();
    this.sides[index].i = 0;
    this.game.audio?.play('menu');
    this._say(`${p.name} joined the counter`);
  }

  _drive(index, pad, dt) {
    if (!pad) return;
    const side = this.sides[index];
    const rows = this._rowCount(index);

    /* A QUESTION FREEZES THIS SIDE'S CURSOR, AND THAT IS READ BEFORE THE STICK.
       It used to be read after, so the stick still walked the list while
       "Sell Ward for 90 points?" was on screen — the highlight slid off the
       row the question was about and onto whatever she drifted onto, and the
       answer then acted on an orb that was no longer under her cursor. The
       purchase itself was always safe (`_answerHere` takes the id from the
       QUESTION, not from the cursor, and says so) — but what she could SEE
       disagreed with what she was agreeing to, which is the same failure one
       layer up: a confirmation you cannot trust the look of is not one.

       `start` is read first and still works. It is the way out of the whole
       screen and trapping a kid behind a dialog is worse than any of this.

       ONLY HER OWN CURSOR IS FROZEN. The other three girls carry on shopping,
       which is the rule this screen exists for. */
    /* ARMED FIRST, BEFORE ANY BUTTON ON THIS SCREEN IS READ — including
       START, so the press that opened the window cannot bounce straight back
       out of it either. See `Side.armed`. */
    if (!side.armed) {
      side.armT += dt;
      if (side.armT < ARM_GRACE && ARM_ACTIONS.some((a) => pad.down(a))) return;
      side.armed = true;
    }

    if (pad.pressed('start')) { this.close({ back: false }); return; }
    if (side.pending) {
      if (pad.pressed('jump')) this._answerHere(index, true);
      else if (pad.pressed('attack') || pad.pressed('interact')) this._answerHere(index, false);
      side.hold = 0;
      side.pointHold = 0;
      return;
    }

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
      /* WHOSE CURSOR MOVED, for `_followCursors`. Only a STICK sets it: a tap
         put the row under her finger, so it is on screen by definition, and
         scrolling to it could only move it out from under somebody else. */
      this._moved = index;
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

    /* A QUESTION OWNS THIS SIDE'S BUTTONS UNTIL SHE ANSWERS IT, and only this
       side's — the other girls carry on shopping. JUMP is yes because JUMP is
       what she pressed to get here; everything else that is not the stick is
       no, because "I did not mean that" is the answer a wrong press wants and
       every other button on this screen is a wrong press now. Handled at the
       top of this function, above, together with the frozen cursor. */

    if (this.mode === 'shop') this._shopButtons(index, pad);
    else this._tradeButtons(index, pad, side);
  }

  _tradeButtons(index, pad, side) {
    if (pad.pressed('jump')) this._offerHere(index);
    if (pad.pressed('attack')) this._confirmHere(index);
    if (pad.pressed('sprint')) this._dropHere(index);

    if (pad.pressed('interact')) {
      /* BACK OUT ONE LAYER AT A TIME, and with several orbs on the table the
         middle layer drops ALL of them rather than the last one picked. She
         has no way to know which one that was — the slots are a grid, not a
         stack — so "un-offer the most recent" would look like the button
         picking one at random. One press clears the offer; JUMP on a slot is
         still how you take exactly one back off. */
      if (side.ready) side.ready = false;
      else if (side.offers.size) side.offers.clear();
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
    /* Changing the offer CLEARS HER CONFIRM. A girl who has said yes to
       swapping her Ward and then adds her Gale to the pile has not agreed to
       that trade, and letting the tick survive the change is precisely the
       "traded against her will" the brief rules out. It is more true with a
       set than it was with one orb: the offer can now grow after she ticked. */
    if (side.offers.has(side.i)) side.offers.delete(side.i);
    else side.offers.add(side.i);
    side.ready = false;
    side.sure = false;
    side.pending = null;
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
      .some((sd) => sd.offers.size > 0 || sd.points > 0);
    if (!anything) {
      this._say('Somebody has to offer something first');
      this.game.audio?.play('deny');
      return;
    }
    side.ready = !side.ready;
    /* UN-CONFIRMING THROWS AWAY HER ANSWER TOO. Otherwise a girl who backs out
       and comes back in is already half-way through agreeing to a trade she
       has since changed — the same "traded against her will" the offer clears
       for, one step further along. */
    if (!side.ready) { side.sure = false; side.pending = null; }
    this.game.audio?.play(side.ready ? 'score' : 'menu');
  }

  /**
   * ASK, THEN DO — the one place on this screen where money changes hands.
   *
   * Buying and selling used to happen on the press. Both are one button in a
   * list of eight identical-looking rows that a stick scrolls through, sell is
   * a LOSS (the orb goes for less than it cost), and neither can be undone.
   * A girl aiming for the row below hers sold her Ward and there was nothing
   * on screen that had told her she was about to.
   *
   * THE QUESTION IS PER SIDE, NOT A MODAL. See `Side.pending` — only the girl
   * being asked can answer it, and the rest of the screen keeps working while
   * she thinks about it.
   *
   * REFUSALS ARE STILL IMMEDIATE. Asking "buy this?" and then answering "you
   * cannot afford it" is two presses to be told no; the refusal has to come
   * first, exactly where it did before.
   */
  _ask(index, pending) {
    this.sides[index].pending = pending;
    this.game.audio?.play('menu');
  }

  /** JUMP, or a tap on BUY. */
  _buyHere(index) {
    const player = this.game.players[index];
    const K = this.game.kotodama;
    const id = ORB_IDS[this.sides[index].i];
    const why = K.buyRefusal(player, id);
    if (why) { this._say(why); this.game.audio?.play('deny'); return; }
    /* `priceOf`, NEVER `K.price`. Eight of the nine kinds cost the shelf
       price and one does not, and the number a girl is asked to confirm has to
       be the number she is charged — a confirmation quoting the wrong figure
       is worse than no confirmation, because she read it and agreed to it. */
    this._ask(index, {
      kind: 'buy', id,
      text: `Buy ${ORB_BY_ID[id].name} for ${K.priceOf(id)} points?`,
    });
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
    this._ask(index, {
      kind: 'sell', id,
      text: `Sell ${ORB_BY_ID[id].name} for ${K.sellPriceOf(id)} points?`
        + ` You paid ${K.priceOf(id)}.`,
    });
  }

  /**
   * SPRINT, or a tap on DROP: put the offered pile on the ground.
   *
   * ASKED FOR AS "add a button they can select to drop the currently selected
   * orbs". CURRENTLY SELECTED IS THE OFFER, not the cursor — the pile she has
   * already picked out with JUMP, which is the only multi-orb selection this
   * screen has and the one she can see. A drop that acted on the single row
   * under her cursor would need a second kind of selection to explain, next to
   * a control that already means "these ones".
   *
   * IT ASKS FIRST, like everything else here that cannot be undone by pressing
   * the same button again. Seventh non-negotiable — and the question NAMES
   * every orb, for the same reason the trade question does: a yes-press behind
   * a list she cannot see is not consent.
   */
  _dropHere(index) {
    const player = this.game.players[index];
    const side = this.sides[index];
    if (!player || !side) return;
    const ids = [...side.offers].sort((x, y) => x - y)
      .map((k) => player.powerOrbs[k]).filter(Boolean);
    /* THE REFUSAL IS AN INSTRUCTION. Sixth non-negotiable: "nothing selected"
       is a label for a state; this has to say what to go and press. */
    if (!ids.length) {
      this._say('Pick the orbs to drop first — JUMP on each one');
      this.game.audio?.play('deny');
      return;
    }
    const names = ids.map((id) => ORB_BY_ID[id].name).join(' + ');
    this._ask(index, {
      kind: 'drop', ids,
      text: `Drop ${names} on the ground? Anyone can pick them up.`,
    });
  }

  /**
   * She said yes. Do the thing she was asked about.
   *
   * THE ORB ID IS TAKEN FROM THE QUESTION, NOT FROM HER CURSOR. Between the
   * question and the answer she can have moved — the stick is not frozen, and
   * on a phone the confirm button is somewhere else on screen entirely — and
   * a confirmation that acts on the cursor rather than on what it asked about
   * is worse than no confirmation at all: it puts a yes-press behind the wrong
   * orb, which is the exact accident it was added to prevent.
   */
  _answerHere(index, ok) {
    const side = this.sides[index];
    const q = side.pending;
    if (!q) return false;
    side.pending = null;
    if (!ok) {
      this.game.audio?.play('deny');
      /* SAYING NO TO A TRADE CALLS THE WHOLE TRADE OFF, rather than only
         closing her own box.

         This was a live bug and it is the kind that is invisible from the
         code: `_maybeTrade` runs every frame, and every frame it found two
         girls still ticked and one of them without a question up — so it put
         the same question straight back. She pressed no, the box blinked, and
         it was still there. The only escape was to work out that un-ticking
         CONFIRM was a separate control.

         Clearing only her own tick would fix the loop and leave a worse bug:
         her sister is still ticked AND still holding a `sure`, so re-ticking
         would fire a trade off an agreement she gave to different terms.
         `sure` is exactly the thing that must not survive a change she did not
         see, so a no drops both of them and both sides start again. */
      if (q.kind === 'trade') {
        /* AND IT PUTS EVERY ORB BACK, which is the second half and is asked
           for. With one orb on the table, leaving the offer up after a no was
           merely tidy — one press of JUMP took it back off. With a pile of
           them it is a chore: she has to remember which four slots she picked
           and un-pick each one, on a grid where an offered slot and a full one
           differ by a ring. Saying no is the deselect-all, and it is the only
           one there is.

           `reset` rather than clearing the fields by hand, so this cannot
           drift from what a completed trade does. It keeps her cursor where
           it was — `reset` deliberately does not touch `i` — so the screen
           does not jump under her at the same moment as everything else. */
        for (const sd of this.sides.slice(0, this.game.players.length)) sd.reset();
        /* And it says who and why, AND that everything went back. A screen
           that silently empties two piles is indistinguishable from one that
           crashed; sixth non-negotiable. */
        this._say(`${this.game.players[index]?.name ?? 'She'} said no`
          + ' — trade is off and everything is back');
      }
      return true;
    }

    const player = this.game.players[index];
    const K = this.game.kotodama;
    if (q.kind === 'buy') {
      /* Asked AGAIN on the way through. Between question and answer somebody
         else can have bought the last one, or she can have spent the points
         somewhere else on this same screen. */
      const why = K.buyRefusal(player, q.id);
      if (why) { this._say(why); this.game.audio?.play('deny'); return true; }
      K.buy(player, q.id);
      this._say(`Bought ${ORB_BY_ID[q.id].name}`);
    } else if (q.kind === 'sell') {
      if (!player.powerOrbs.includes(q.id)) {
        this._say(`${player.name} has no ${ORB_BY_ID[q.id].name} to sell`);
        this.game.audio?.play('deny');
        return true;
      }
      K.sell(player, q.id);
      this._say(`Sold ${ORB_BY_ID[q.id].name} for ${K.sellPrice}`);
    } else if (q.kind === 'drop') {
      /* THE IDS COME OFF THE QUESTION, like every other answer here — see the
         note above. She can have moved her cursor, or changed the pile, in the
         gap between asking and answering. */
      const n = K.drop(player, q.ids);
      /* A PARTIAL DROP IS REPORTED HONESTLY. `Kotodama.drop` declines an orb
         it cannot find ground for rather than deleting it, so "dropped 3" when
         she asked for 4 is a real outcome and saying "dropped them" would be
         the screen lying about where her orbs are. */
      if (!n) {
        this._say('Nowhere to put them down here — try somewhere flatter');
        this.game.audio?.play('deny');
        return true;
      }
      this._say(n === q.ids.length
        ? `${player.name} dropped ${n === 1 ? 'it' : `all ${n}`} — walk away and they are anyone's`
        : `${player.name} dropped ${n} of ${q.ids.length} — no room for the rest`);
      this.game.toast(`${player.name} dropped ${n} orb${n === 1 ? '' : 's'}`, player.index);
      /* AND THE PILE GOES OFF THE TABLE. Those slots do not exist any more —
         `Side.offers` is a set of ROW numbers, and the rows below the ones she
         just dropped have shuffled up underneath it. Leaving it would leave
         her offering whatever moved into those positions. */
      side.reset();
    } else if (q.kind === 'trade') {
      /* Nothing to do here — `_maybeTrade` looks at who is still `ready` and
         has answered, and fires on the frame the last one does. Answering is
         the whole action. */
      this.game.audio?.play('score');
      side.sure = true;
    }
    return true;
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
    if (ready.length < 2) {
      /* Somebody backed out while the question was up. Take it down — a
         dialog asking about a trade that no longer has two sides is a yes she
         cannot mean. */
      for (const sd of live) { if (sd.pending?.kind === 'trade') { sd.pending = null; sd.sure = false; } }
      return;
    }
    if (ready.length > 2) {
      this._say('Only two at a time — one of you un-confirm');
      return;
    }

    const [ia, ib] = ready;
    const A = this.sides[ia];
    const B = this.sides[ib];
    const pa = this.game.players[ia];
    const pb = this.game.players[ib];
    /* SORTED, so the sentence she is asked names them in the order they sit in
       her own row. A Set iterates in insertion order, which is the order she
       happened to press them in — true, and not what she is looking at. */
    const ids = (side, p) => [...side.offers].sort((x, y) => x - y)
      .map((k) => p.powerOrbs[k]).filter(Boolean);
    const aIds = ids(A, pa);
    const bIds = ids(B, pb);
    if (!aIds.length && !bIds.length && !A.points && !B.points) return;

    /* ---- and now each of them is asked, separately -----------------------
       CONFIRM used to be the last press: two ticks and the orbs moved. That
       is one press per girl for something permanent, on a screen where the
       same button also means "un-confirm", and what she agreed to can have
       changed underneath her between her tick and her sister's — a points
       offer is edited with a stick, and editing it does not clear the OTHER
       girl's tick. So the tick means "I am ready", and this asks the actual
       question, in words, naming exactly what leaves and what arrives.

       BOTH DIALOGS ARE UP AT ONCE AND EACH ONLY ANSWERS TO ITS OWN PAD. That
       is the rule this screen exists for, restated at the last possible
       moment: consent cannot be expressed through somebody else's controller.
       `_drive` routes a pending side's buttons to `_answerHere`. */
    /* THE QUESTION NAMES EVERY ORB, however many there are. A pile summarised
       as "3 orbs" is a yes-press behind a list she cannot see, which is the
       same complaint the cursor lock above fixes and the reason this screen
       asks in words at all. Four names and a points figure is a long sentence
       and it is still one she can read; the cap of eight is what keeps it
       from becoming a paragraph. */
    const what = (list, pts) => {
      const bits = list.map((id) => ORB_BY_ID[id].name);
      if (pts) bits.push(`${pts} points`);
      return bits.length ? bits.join(' + ') : 'nothing';
    };
    const askSide = (i, mine, minePts, hers, herPts, her) => {
      const sd = this.sides[i];
      if (sd.pending || sd.sure) return 0;
      sd.pending = {
        kind: 'trade',
        text: `Give ${what(mine, minePts)} to ${her.name} for ${what(hers, herPts)}?`,
      };
      return 1;
    };
    const aPtsAsk = Math.min(A.points, pa.score);
    const bPtsAsk = Math.min(B.points, pb.score);
    if (!A.sure || !B.sure) {
      /* Asked once, not once a frame: `_maybeTrade` runs every tick for as
         long as the question is on screen, and a menu blip at 138Hz is a tone.
         `askSide` returns whether it actually put something up. */
      const opened = askSide(ia, aIds, aPtsAsk, bIds, bPtsAsk, pb)
        | askSide(ib, bIds, bPtsAsk, aIds, aPtsAsk, pa);
      if (opened) this.game.audio?.play('menu');
      return;
    }

    /* POINTS MOVE WITH THE ORBS OR NOT AT ALL. `kotodama.trade` is already
       atomic — it removes both orbs before giving either, so a swap into a
       full kitten cannot leave one of them a copy down — and points have to
       be inside that same all-or-nothing, or a refused orb swap still empties
       somebody's purse. Checked first, moved after. */
    const aPts = Math.min(A.points, pa.score);
    const bPts = Math.min(B.points, pb.score);
    const orbs = aIds.length + bIds.length;

    /* POINTS ALONE ARE A TRADE, AND `kotodama.trade` CANNOT SAY SO. It is an
       orb function and it refuses two empty piles, correctly — a swap of no
       orbs for no orbs is a no-op to it. This used to hand that `false`
       straight to the refusal below, so EVERY points-only gift on this screen
       was turned down with a sentence about carrying nine orbs, when neither
       girl had offered one. Ask it only when there are orbs to move; a pile of
       points is moved by the same three lines either way. */
    const moved = orbs ? this.game.kotodama.trade(pa, aIds, pb, bIds) : true;

    /* AND A TRADE THAT HAS EVAPORATED IS REFUSED IN WORDS. The offer above is
       clamped to what she has, so this should not happen — but if it ever does
       the alternative is two toasts reading "gave nothing", which is the
       silently-does-nothing that the sixth rule exists to forbid. */
    if (moved && !orbs && !aPts && !bPts) {
      this._say('There is nothing left on the table to trade');
      this.game.audio?.play('deny');
      for (const s of this.sides) s.reset();
      return;
    }

    if (moved) {
      /* The orb path rings the till itself, on its way out of `trade`. */
      if (!orbs) this.game.sfx('trade');
      if (aPts) { pa.score -= aPts; pb.score += aPts; }
      if (bPts) { pb.score -= bPts; pa.score += bPts; }
      if (aPts || bPts) {
        this.game.onScoreChanged?.(pa);
        this.game.onScoreChanged?.(pb);
      }
      const gave = (p, list, pts) => {
        const bits = list.map((id) => ORB_BY_ID[id].name);
        if (pts) bits.push(`${pts} points`);
        return bits.length ? `${p.name} gave ${bits.join(' + ')}` : null;
      };
      const parts = [gave(pa, aIds, aPts), gave(pb, bIds, bPts)].filter(Boolean);
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
    if (pad.pressed('interact')) {
      /* A JOINER STEPS BACK; THE SHOPPER SHUTS THE SHOP. The screen exists
         because she walked to the counter, and a sister who joined out of
         curiosity closing it on her is the four-player version of somebody
         else pressing your buttons. Everybody still has `start`, and the
         shopper still has this — nobody is trapped. */
      if (this.joined.size > 1 && this.game.players[index] !== this.shopper) {
        this.joined.delete(index);
        this.sides[index].reset();
        this.game.audio?.play('menu');
        this._say(`${this.game.players[index]?.name} stepped back`);
        return;
      }
      this.close();
    }
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

    /* THE FOOTER STOPS NAMING THE OTHER MEANINGS WHILE SOMEBODY IS BEING
       ASKED. Down here JUMP means "buy" or "offer"; in the strip that has just
       appeared, JUMP means "yes" — and both sentences cannot be on screen at
       once without one of them being a lie. The strip wins because it is where
       she is looking, so the footer has to give way.

       It says WHOSE controller rather than restating the keys as if they were
       everybody's: with four kittens on this screen one of them is being asked
       and three are still shopping, and there is no single true instruction to
       print. Naming the rule is the only honest thing that fits. */
    const asked = this.sides.slice(0, this.game.players.length)
      .map((sd, i) => (sd.pending ? this.game.players[i]?.name : null))
      .filter(Boolean);
    const many = asked.length > 1;
    const keys = asked.length
      ? `${asked.join(' and ')} ${many ? 'are' : 'is'} being asked`
        + ' — JUMP <b>yes</b>, ATTACK or INTERACT <b>no</b>,'
        + `${many ? ' <b>each on her own controller</b>' : ' <b>on her own controller</b>'}`
      : null;

    if (this.mode === 'shop') {
      this.title.textContent = 'KOTODAMA DEALER';
      this.body.innerHTML = this._shopMarkup();
      this.help.innerHTML = this._flashT > 0
        ? `<em>${this._flash}</em>`
        : keys ?? 'JUMP <b>buy</b> · ATTACK <b>sell</b> · INTERACT <b>leave</b>'
          + (this.game.players.length > 1 ? ' · MOUNT <b>join in</b>' : '');
    } else {
      this.title.textContent = 'CHARACTER PROFILE';
      this.body.innerHTML = this.game.players.map((p, i) => this._cardMarkup(p, i)).join('');
      this.help.innerHTML = this._flashT > 0
        ? `<em>${this._flash}</em>`
        : keys ?? 'JUMP <b>offer this orb</b> (as many as you like)'
          + ' · ATTACK <b>confirm</b> · SPRINT <b>drop them</b>'
          + ' · INTERACT <b>take them all back</b>'
          + ' — <b>both</b> must confirm';
    }
    this._paintActions();
    this._followCursors();
  }

  /**
   * Keep the row a stick just moved to on screen.
   *
   * ONE SHELF, UP TO FOUR CURSORS, AND ONLY ONE SCROLL POSITION. That is not a
   * problem this screen can solve properly — four girls looking at one list
   * can want four different parts of it — so it solves the half that matters:
   * `block: 'nearest'` moves the box ONLY when the row is actually off screen,
   * so a sister scrolling within what everybody can already see moves nothing,
   * and the shelf shifts only when it is the difference between a kitten
   * seeing her own cursor and not seeing it.
   *
   * THE MOVED ONE, NOT THE FIRST ONE. Scrolling to a fixed cursor would mean
   * the other three could never reach the bottom of a long shelf: whoever's
   * cursor won would drag the view back on the next repaint, which reads as
   * the stick fighting you. `_moved` is set by whichever side last stepped and
   * cleared here.
   *
   * IT IS A NO-OP UNTIL THE LIST IS LONGER THAN ITS BOX, which is why this can
   * exist without changing anything at eight rows — the fifth non-negotiable
   * asks for the two-player game to come out bit-identical, and a scroll
   * container with nothing to scroll does nothing at all.
   */
  _followCursors() {
    const i = this._moved;
    this._moved = null;
    if (i == null || !this.body) return;
    const sel = this.mode === 'shop'
      ? `.kd-shelf .kd-row[data-slot="${this.sides[i].i}"]`
      : `.kd-card.kd-p${i} [data-slot="${this.sides[i].i}"]`;
    this.body.querySelector(sel)?.scrollIntoView({ block: 'nearest' });
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
    /* THE PILE IS IN THE SIGNATURE because DROP appears and disappears with
       it. Without this the button is drawn once, from whatever the offers were
       the first time this ran, and offering an orb leaves the footer showing
       the row it had before — the same class of miss as a join being invisible
       (see `_signature`). */
    const sig = `${this.mode}|${i}|${this.sides[i]?.ready}|${!!this.sides[i]?.pending}`
      + `|${this.sides[i]?.offers.size ?? 0}`;
    if (sig === this._actionSig) return;
    this._actionSig = sig;
    /* EMPTIED WHILE SHE IS BEING ASKED. The YES/NO pair lives in her card, next
       to the question it answers; leaving BUY and SELL down here as well would
       put four buttons on a phone, two of which start a second question on top
       of the one she has not answered. The pad has the same rule — see the
       `side.pending` branch in `_drive`. */
    if (this.sides[i]?.pending) { this.actions.innerHTML = ''; return; }
    const btn = (act, label, cls = '') =>
      `<button type="button" class="kd-act ${cls}" data-act="${act}" data-side="${i}">${label}</button>`;
    this.actions.innerHTML = this.mode === 'shop'
      ? btn('buy', 'BUY') + btn('sell', 'SELL')
      : btn('offer', 'OFFER') + btn('confirm', this.sides[i]?.ready ? 'UNCONFIRM' : 'CONFIRM', 'go')
        /* DROP IS ONLY DRAWN WHEN IT WOULD DO SOMETHING. There is no SPRINT
           button on the on-screen pad, so this is a phone's ONLY way to reach
           it — but a third button in that row on every visit, greyed out for
           most of them, is clutter in the place a nine-year-old is trying to
           find CONFIRM. It appears with the pile it acts on. */
        + (this.sides[i]?.offers.size ? btn('drop', 'DROP') : '');
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
      /* The offers are a SET, so they are spelled out rather than stringified
         — `${set}` is "[object Set]" for every possible pile, and the screen
         would have stopped repainting the moment the second orb was picked. */
      this.sides.map((s) => `${s.i}/${[...s.offers].sort().join('+')}`
        + `/${s.points}/${s.ready}/${s.sure}/${s.pending?.text ?? ''}`).join(';'),
      this.mode === 'shop' ? ORB_IDS.map((id) => K.stock[id]).join(',') : '',
      /* WITHOUT THIS A JOIN IS INVISIBLE. Nothing else on the signature moves
         when a kitten presses MOUNT — her cursor was already 0 and her purse
         has not changed — so the screen kept the markup it had and her pip
         never appeared. */
      this.mode === 'shop' ? [...this.joined].sort().join(',') : '',
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
        side.offers.has(k) ? 'offered' : '',
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
    /* THE WHOLE SET IS HANDED TO `detail`, not just this row's count. 壁 Ward's
       block length is a function of how many 守 Long Guard she is also
       wearing, so a row that only knew its own count would print the shipped
       2.0s to a girl who has paid two and a half times the shelf price for
       more than that. Every other spec ignores the argument. */
    const counts = countsOf(owned);
    const detail = here
      ? `<b>${here.name}</b> · ${here.label}<br><span class="kd-dim">${here.detail(n, counts)}${n > 1 ? `  (x${n})` : ''}</span>`
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

    const offered = [...side.offers].sort((a, b) => a - b)
      .map((k) => ORB_BY_ID[owned[k]]?.name ?? '—');
    if (side.points > 0) offered.push(`${side.points} points`);
    const state = side.ready
      ? '<span class="kd-ready">CONFIRMED</span>'
      : offered.length
        ? `offering <b>${offered.join(' + ')}</b>`
        : '<span class="kd-dim">offering nothing</span>';

    return `<div class="${cls}">
      <div class="kd-name">${player.name}</div>
      ${this._clanMarkup(player)}
      <div class="kd-meta">${player.score} pts · ${owned.length}/${MAX_EQUIPPED} orbs</div>
      ${this._askMarkup(index)}
      <div class="kd-slots" data-slots>${slots.join('')}</div>
      ${this.mode === 'profile' ? pointsRow : ''}
      <div class="kd-detail">${detail}</div>
      <div class="kd-state">${state}</div>
    </div>`;
  }

  /**
   * WHICH CLAN THIS KITTEN SWORE TO, in the clan's own colour.
   *
   * IT WAS ALREADY ON THIS CARD AND NOBODY COULD SEE IT. The clan name was the
   * first third of the grey `kd-meta` line — `Riverclaw · 40 pts · 3/8` — at
   * 13px and 75% opacity, punctuation-separated from two numbers it has nothing
   * to do with. Reported as "the profile doesn't say what clan you're in",
   * which is the correct report about a fact that is technically present: an
   * oath is the biggest decision in the game outside the ring, and it was
   * sharing a line with an inventory count.
   *
   * SO IT IS ITS OWN ROW, IN THE CLAN'S COLOUR, AND IT NAMES THE BUFF. The
   * colour is the same `clan.color` the HUD badge, the shrine and the second
   * marker ring under her paws all use — read from the CLANS entry rather than
   * restated here, for the reason the score badge reads `styleCss`: a colour
   * written down twice is a colour that goes wrong in one place. And the buff
   * is on the row because the clan NAME is not the thing she is choosing
   * between; "Longer katana" is.
   *
   * PANDAPAW IS THE ONE THAT NEEDS A LIVE ANSWER, and it deliberately does NOT
   * get one here. Its badge in the HUD counts bamboo toward the next tier
   * (`Game._updateClanBadge`), which is a number that moves while she plays —
   * this screen is opened, read and closed, and a second copy of that counter
   * would be a second place for it to be wrong. The row says what she swore to
   * and what it grants; the counter has one home.
   *
   * UNSWORN IS AN INSTRUCTION, NOT A NOUN. "no clan" is a label for a state,
   * and the sixth non-negotiable is that a thing which is not yet true has to
   * say what to DO about it — so it names the verb (find a shrine) and the
   * gesture (stand in the ring and press the button), which is the same
   * sentence the shrine itself uses when you are standing in front of it.
   */
  _clanMarkup(player) {
    const clan = player.clan;
    if (!clan) {
      return '<div class="kd-clan kd-clan-none">No clan yet — '
        + 'find a shrine on any island and swear an oath.</div>';
    }
    const hex = `#${clan.color.toString(16).padStart(6, '0')}`;
    return `<div class="kd-clan" style="--clan:${hex}">`
      + `<b>${clan.name}</b><span>${clan.buff.label}</span></div>`;
  }

  /**
   * One side's question, drawn INSIDE HER OWN CARD rather than over the screen.
   *
   * THAT PLACEMENT IS THE POINT. `Confirm` is a modal because the things it
   * guards belong to nobody in particular; this one belongs to exactly one
   * girl, and a box in the middle of a four-player trade screen would be
   * answered by whoever was nearest. In her card, ringed in her colour, it is
   * obvious whose turn it is to speak — and the other three keep shopping
   * underneath it, which a modal cannot allow.
   *
   * AND IT SITS DIRECTLY UNDER HER NAME, not at the bottom of the card. `kd-body`
   * scrolls, a card with eight orb slots and a points row is taller than a
   * laptop half-window, and a question below the fold is a CONFIRM press that
   * appears to do nothing — which is the silent refusal the sixth
   * non-negotiable exists to forbid, reintroduced by layout rather than by
   * code. Under the name it is the first thing in the card either way, and the
   * name says whose question it is before the colour does.
   *
   * IT NAMES THE BUTTONS, NOT "YES" AND "NO". The footer's help line is
   * telling her JUMP means buy at the same moment this is telling her JUMP
   * means yes, and only one of those can be true; this one is closer to her
   * eyes and it wins, so it has to say which key it means. Sixth
   * non-negotiable: an instruction, not a noun.
   */
  _askMarkup(index) {
    const q = this.sides[index]?.pending;
    if (!q) return '';
    /* Two real buttons on a phone, because the pad this screen covers is where
       JUMP and ATTACK live — the same hole `_paintActions` fills. On desktop
       the keys are named and buttons would be clutter. */
    const touch = !!this.game.device?.touchPrimary;
    const keys = touch
      ? `<button type="button" class="kd-act go" data-act="yes" data-side="${index}">YES</button>`
        + `<button type="button" class="kd-act" data-act="no" data-side="${index}">NO</button>`
      : '<span>JUMP <b>yes</b> · ATTACK or INTERACT <b>no</b></span>';
    return `<div class="kd-ask kd-p${index}">
      <div class="kd-ask-q">${q.text}</div>
      <div class="kd-ask-keys">${keys}</div>
    </div>`;
  }

  /** Everybody shopping right now, in seat order. The opener is always in it. */
  _shoppers() {
    return this.game.players.filter((p) => p && this.joined.has(p.index));
  }

  _shopMarkup() {
    const K = this.game.kotodama;
    const shoppers = this._shoppers();

    const rows = POWER_ORBS.map((spec, k) => {
      const stock = K.stock[spec.id] ?? 0;
      /* ONE ROW, UP TO FOUR CURSORS. Four girls can be looking at the same
         shelf and two of them can be on the same line, so "the cursor" is not
         a single thing any more — it is a pip per kitten whose cursor is here,
         in her own colour, in the one place she is already looking. A single
         highlight would have had to pick a winner, and the loser's stick would
         have read as broken. */
      const here = shoppers.filter((p) => this.sides[p.index].i === k);
      const pips = here
        .map((p) => `<i class="kd-seat kd-p${p.index}" title="${p.name}"></i>`).join('');
      const cls = ['kd-row', here.length ? 'cursor' : '', stock ? '' : 'out']
        .filter(Boolean).join(' ');
      /* THE COUNT IS WHOSE CURSOR IS ON THE ROW, not the opener's. "you have"
         with four people reading it was already a lie the moment a second
         kitten could shop; it names her instead, and falls back to the opener
         when nobody is on this line.

         AND WITH TWO CURSORS ON ONE ROW IT NAMES BOTH. One of them was being
         picked — `here[0]`, whoever happened to be lowest-numbered — so two
         sisters looking at the same shelf read one count and the girl it did
         not belong to was told how many her sister had. Every cursor on the
         row now gets its own clause.

         THE OPENER GOES LAST, which is the one bit of order in it. She is the
         one who walked to the counter and the one most likely to be about to
         press BUY, and the end of a sentence is where the eye stops. */
      const named = [...here].sort((x, y) => (
        (x === this.shopper ? 1 : 0) - (y === this.shopper ? 1 : 0)
      ));
      const count = (q) => q.powerOrbs.filter((x) => x === spec.id).length;
      /* THE PRICE IS ON THE ROW WHEN IT IS NOT THE SHELF PRICE. The header
         line says "buy 650 / sell 488" and that is true of eight of the nine;
         printing every row's price would repeat one number nine times to say
         one thing once, and printing none of them lets a rare orb ambush her
         at the confirmation. So the row carries a figure exactly when the
         figure is news. */
      const cost = K.priceOf(spec.id);
      const rare = cost !== K.price
        ? `<div class="kd-rare">RARE · ${cost}</div>` : '';
      const mineLine = named.length
        ? named.map((q) => `${q.name} has ${count(q)}`).join(' / ')
        : (shoppers[0] ? `${shoppers[0].name} has ${count(shoppers[0])}` : '');
      return `<div class="${cls}" style="--orb:#${spec.color.toString(16).padStart(6, '0')}"
        data-side="${(here[0] ?? shoppers[0])?.index ?? 0}" data-slot="${k}">
        <div class="kd-dot"><span>${spec.kanji}</span></div>
        <div class="kd-row-main">
          <b>${spec.name}</b> — ${spec.label}
          <div class="kd-dim">${spec.blurb}</div>
        </div>
        <div class="kd-row-num">
          <div>${stock ? `in stock ${stock}` : 'SOLD OUT'}</div>
          ${rare}
          <div class="kd-dim">${mineLine}</div>
        </div>
        <div class="kd-seats">${pips}</div>
      </div>`;
    }).join('');

    const purses = shoppers.map((p) => `<span class="kd-purse-one kd-p${p.index}">
      ${p.name} · <b>${p.score}</b> · ${p.powerOrbs.length}/${MAX_EQUIPPED}</span>`).join('');
    /* THE INVITATION NAMES WHO IT IS FOR. "Press MOUNT to join" on a screen
       three of the four are already on reads as an instruction to all of them
       and is only true for one — the same reasoning as the clan prompt over a
       kitten's head, and the same failure if it is got wrong. */
    const waiting = this.game.players.filter((p) => p && !this.joined.has(p.index));
    const invite = waiting.length
      ? `<div class="kd-invite">${waiting.map((p) => p.name).join(', ')} —
         press <b>MOUNT</b> to shop too</div>`
      : '';

    /* THE SHELF IS ITS OWN SCROLLING BOX, and the header, the invitation and
       the questions are outside it.

       WHY IT HAD TO STOP BEING A LIST THAT JUST GETS LONGER. There were eight
       kinds and the panel held eight rows; there are nine now and there is no
       reason to expect that to be the last one. A tenth row pushes the footer
       — which is where the buttons are on a phone and where the key names are
       everywhere else — off the bottom of the screen, and the girl driving the
       stick has no way of knowing there is a row below the one she can see.
       So the shelf keeps a fixed height of `--shelf-rows` rows and scrolls
       inside it, `_paint` walks the moved cursor back into view, and the panel
       around it stops changing size when the roster does.

       IT SHOWS EIGHT. That is what the screen was built around and what the
       CSS variable says; past that it scrolls. */
    return `<div class="kd-shop">
      <div class="kd-purse">${purses} · buy <b>${K.price}</b> · sell <b>${K.sellPrice}</b></div>
      ${invite}
      ${shoppers.map((p) => this._askMarkup(p.index)).join('')}
      <div class="kd-shelf" data-shelf>${rows}</div>
    </div>`;
  }
}
