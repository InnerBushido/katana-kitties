import { Orb } from '../entities/orb.js';
import { ORB_BY_ID, MAX_EQUIPPED, drawOrb } from '../entities/powerorb.js';
import { BALL_COUNT } from '../entities/dragonball.js';
import { CLANS } from '../world/world.js';
import { cssFor } from '../core/palette.js';
import { inDojoView } from './mathdojo.js';

/** A three.js colour as CSS, for the chips on the award card. */
const hex = (c) => `#${(c ?? 0).toString(16).padStart(6, '0')}`;
/** Names come off the character picker and orb specs, so nothing here is
 *  hostile — but this markup is built with a template string, and the one rule
 *  about those is that the rule is never bent "just this once". */
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ---------------------------------------------------------------------------
   QUESTS — the other way to earn a Powerup Kotodama.

   Asked for as "new ways to unlock powerup orbs after the Ending Cutscene.
   These can be viewed as like Quests, Achievements, or Accomplishments." The
   game already had exactly one of these, unnamed: whoever collected the most
   plain orbs is handed a Powerup Kotodama at 100% (`Kotodama.awaken`). This
   file is the other eight, and the list the Help page and the profile screen
   both read, so all nine are described in one place.

   EARNED BEFORE THE END, PAID AT THE END. Nothing here is a Powerup Kotodama
   before 100% mischief, because none exist before 100% mischief — the whole
   endgame is built on the Awakening being the moment they arrive. What a
   kitten gets on the spot is a TOKEN: a small gold copy of the plain orb
   circling her, one per quest, which is a promise she can see. At the
   Awakening every token turns into a real one — at an AWARD CEREMONY, one
   KITTEN at a time.

   ONE KITTEN AT A TIME, NOT ONE ORB AT A TIME. The first version of this paid
   a single orb every 0.9 seconds, round the party, and was rejected on sight:
   "a bit jarring and it spams the screen with text for each orb". Eleven
   toasts in ten seconds is a wall of words nobody reads, and a kitten with
   three quests could not tell which of the three the sentence was about. So a
   turn belongs to a KITTEN: everything she won arrives at once, on one card,
   in two or three sentences with the orbs drawn beside their names, held long
   enough to be read by a seven-year-old rather than long enough to be seen.
   She holds the blessing pose for three and a half seconds with her own camera
   pushed in on her — the star's fanfare, because this IS the fanfare — and
   only when her card is gone does the next kitten's turn begin.

   AND NOBODY FLIES TO THE ARENA IN THE MIDDLE OF IT. "The players must all
   receive their awards before they can enter the Arena" — `ceremonyBusy` is
   the one question, asked at Mr Satan's prompt and again at the door in
   `Game.enterArena`, because a griffin taking off mid-ceremony would strand
   the rest of the party's turns behind a tournament.

   THE DOOR SHUTS AT THE AWAKENING. "If achieved after the end of the game,
   after the ending cutscene, it does not count" — `open` is simply
   `!kotodama.awakened`, the same flag everything else in the endgame reads,
   so there is no second clock that could disagree with it. The three quests
   that can only be decided AT the end (the last piece of mischief, the most
   mischief, the most dragon balls if the seventh was never found) are settled
   in `onAwaken`, on the same frame, before the door is looked at.

   PAID WHEN THE SCREEN IS FREE, NOT WHEN THE ENDING FINISHES. The finale is 63
   seconds and skippable on its first frame. The tokens are STATE — saved,
   restored, carried out of the game by a kitten who leaves — and the payout is
   a queue that waits for no scene to be up, the same shape `_finaleDue` has.
   Nothing hangs off a scene finishing: a skip and a watch reach the same
   frame, and a save taken mid-queue still has the unpaid tokens in it.

   TWO KINDS, AND THE DIFFERENCE IS THE PRIZE, NOT THE PRIDE. Four quests can
   be done by every kitten. Five can go to only one of them — and those five
   draw from the WHOLE roster, dealer's shelf included, so they are the only
   way other than paying to be handed a rare orb. "It is random and a lottery":
   `drawOrb({ rare: true })` is a uniform draw over every kind, so today that
   is 2 in 10. The dealer's stock is untouched by any of it.

   A TIE ON A "MOST" QUEST GIVES IT TO EVERYBODY TIED. That is not a new rule;
   it is the plain-orb prize's rule, and its reasoning holds word for word
   here — these are sisters, one of them is younger, and a prize exactly one
   of them can win when they did exactly as well is an argument, not a game.
   The two quests that are genuinely one moment (the last hit, the first to
   ride the second seat for 45 seconds) cannot tie.
--------------------------------------------------------------------------- */

/** Seconds in the Dojo of the Turning Circle, and in Ryuuseki's second seat. */
export const DOJO_NEED = 45;
export const RIDER_NEED = 45;
/** "can be awarded 3 seconds after" — so the quest does not talk over the
 *  moment that earned it: the clan ceremony, the panda growing, taking off. */
export const CELEBRATE_AFTER = 3;
/** How long she holds the token up. SHORTER than the star's two seconds and
 *  with no camera move, because "not disturb gameplay too much" — this is a
 *  nod, and the star is a fanfare. */
export const BLESS_T = 1.2;
/* --- the award ceremony's clock ---
   A beat before the first kitten is called up; her pose; her card; and the
   "second or two later" before the next kitten's turn. The card is held for
   as long as its own words need (`CARD_BASE` plus a per-character allowance,
   the toast's rule) PLUS `CARD_EXTRA`, which is the asked-for "2 - 3 seconds
   longer than normal" — this is the one card in the game somebody is meant to
   study rather than glance at, and a card that outlives the pose is better
   than a pose left standing in silence. */
export const CEREMONY_LEAD = 1.5;
export const CEREMONY_BLESS = 3.5;
export const CEREMONY_GAP = 2;
export const CARD_BASE = 2.6;
export const CARD_PER_CHAR = 0.045;
export const CARD_EXTRA = 2.5;
export const CARD_MAX = 12;
/** The token's colour. GOLD, because the plain orbs are cyan and pink and the
 *  point is that she can tell at a glance which of the things circling her is
 *  a lesson and which is a promise. */
export const TOKEN_COLOR = 0xffc93c;

/**
 * The nine. `who` is 'each' (every kitten can have it), 'one' (the first to
 * do it has it) or 'most' (whoever leads at the end — ties share).
 *
 * `title` is what the checklist says; `how` is the instruction, written as an
 * instruction because an unticked row is a thing she has not done yet and has
 * to say what to DO (sixth non-negotiable). `short` is what the payout toast
 * names.
 *
 * `orbs` — the plain-orb prize the game has always had — is on this list
 * because it IS one of the ways, and a Help page that listed eight of nine
 * would teach the wrong number. It USED to be paid by `Kotodama.awaken` on the
 * spot, and was the only quest that skipped the ceremony; it now goes through
 * the same token and the same turn as the other eight.
 */
export const FEATS = [
  { id: 'clans', who: 'each', icon: '⛩️', title: 'Six oaths',
    short: 'Six oaths', how: 'Swear to all six clans.' },
  { id: 'dojo', who: 'each', icon: '📐', title: 'Student of the circle',
    short: 'Student of the circle',
    how: `Spend ${DOJO_NEED} seconds in the Dojo of the Turning Circle.` },
  { id: 'panda', who: 'each', icon: '🐼', title: 'Panda keeper',
    short: 'Panda keeper', how: 'Raise a panda until it is fully grown.' },
  { id: 'pilot', who: 'each', icon: '🐉', title: 'Dragon pilot',
    short: 'Dragon pilot', how: 'Fly Ryuuseki from the front seat.' },
  { id: 'rider', who: 'one', icon: '🎯', title: 'Beam gunner',
    short: 'Beam gunner',
    how: `Be the first to ride Ryuuseki's second seat for ${RIDER_NEED} seconds.` },
  { id: 'last', who: 'one', icon: '💥', title: 'The very last one',
    short: 'The very last one', how: 'Knock over the last piece of mischief.' },
  { id: 'mischief', who: 'most', icon: '🏮', title: 'Most mischief',
    short: 'Most mischief', how: 'Knock over more things than anybody else.' },
  { id: 'balls', who: 'most', icon: '⭐', title: 'Star finder',
    short: 'Star finder', how: 'Find more dragon balls than anybody else.' },
  { id: 'orbs', who: 'most', icon: '🔮', title: 'Orb collector',
    short: 'Orb collector', how: 'Collect more Kotodama Orbs than anybody else.' },
];
export const FEAT_BY_ID = Object.fromEntries(FEATS.map((f) => [f.id, f]));
export const isSpecial = (id) => FEAT_BY_ID[id]?.who !== 'each';

/** A kitten's quest ledger. Every field survives a save and a drop-out. */
export const blankFeats = () => ({
  got: [], paid: [], dojoT: 0, riderT: 0, mischief: 0, balls: 0,
});

/** Clean a ledger read off disk: unknown quest ids dropped, numbers finite. */
export function cleanFeats(r) {
  const num = (n) => (Number.isFinite(n) && n > 0 ? n : 0);
  const ids = (a) => [...new Set((Array.isArray(a) ? a : []).filter((id) => FEAT_BY_ID[id]))];
  const got = ids(r?.got);
  return {
    got,
    // Only what she has actually earned can have been paid.
    paid: ids(r?.paid).filter((id) => got.includes(id)),
    dojoT: num(r?.dojoT), riderT: num(r?.riderT),
    mischief: Math.round(num(r?.mischief)), balls: Math.round(num(r?.balls)),
  };
}

/**
 * Who is ahead on a number, sharing ties. Nobody leads at zero — "most
 * mischief" at 0-0 is not a thing anybody did. (The plain-orb prize IS given
 * at 0-0, and says why in `Kotodama`; that is its own rule, not this one.)
 */
export function leaders(players, valueOf) {
  const vals = players.map(valueOf);
  const best = Math.max(0, ...vals);
  return best > 0 ? players.filter((_, i) => vals[i] === best) : [];
}

export class Feats {
  constructor(game) {
    this.game = game;
    /** Style name of whoever claimed the one-kitten quest, so a kitten who
     *  leaves and a sister who then rides for 45 seconds cannot both have it. */
    this.claimed = { rider: null };
    /** The seventh dragon ball was found and the Star finder quest settled. */
    this.ballsSettled = false;
    /** Celebrations waiting on their three seconds, or on a free screen. */
    this.pending = [];
    /** Whose turn is on screen right now: `{ player, t, card }`, or null. */
    this.show = null;
    /** Seconds until the next kitten is called up. */
    this.gapT = CEREMONY_LEAD;
  }

  /** The door. Quests count until the Awakening and not a frame after. */
  get open() {
    return !this.game.kotodama?.awakened;
  }

  ledger(p) {
    if (!p) return blankFeats();
    if (!p.feats) p.feats = blankFeats();
    return p.feats;
  }

  has(p, id) {
    return this.ledger(p).got.includes(id);
  }

  /**
   * Mark a quest done. Refuses when the door is shut, or when it is already
   * hers. `atEnd` is the Awakening's own settling, which runs on the frame the
   * door shuts and would otherwise be locked out by it.
   */
  earn(p, id, { delay = 0, atEnd = false } = {}) {
    if (!p || !FEAT_BY_ID[id]) return false;
    if (!this.open && !atEnd) return false;
    const L = this.ledger(p);
    if (L.got.includes(id)) return false;
    L.got.push(id);
    if (atEnd) this.syncTokens(p);
    else this.pending.push({ player: p, id, t: delay });
    return true;
  }

  /* ------------------------------ counters ------------------------------- */

  onMischief(p) {
    if (this.open && p) this.ledger(p).mischief += 1;
  }

  onBall(p) {
    if (this.open && p) this.ledger(p).balls += 1;
  }

  /* ------------------------------- the end ------------------------------- */

  /**
   * The Awakening has just fired. Settle the quests that are decided by the
   * end itself, then let the payout queue take over.
   *
   * @param lastPlayer whoever knocked over the last prop, or null (a debug
   *   unlock has nobody to name, and nobody is given it)
   * @param result `Kotodama.awaken`'s return — `winners` is whoever collected
   *   the most plain orbs, which is the "Orb collector" quest
   */
  onAwaken(lastPlayer = null, result = null) {
    const players = this.game.players ?? [];
    if (lastPlayer && players.includes(lastPlayer)) {
      this.earn(lastPlayer, 'last', { atEnd: true });
    }
    for (const p of leaders(players, (q) => this.ledger(q).mischief)) {
      this.earn(p, 'mischief', { atEnd: true });
    }
    if (!this.ballsSettled) {
      this.ballsSettled = true;
      for (const p of leaders(players, (q) => this.ledger(q).balls)) {
        this.earn(p, 'balls', { atEnd: true });
      }
    }
    /* THE PLAIN-ORB PRIZE IS A QUEST LIKE THE OTHERS NOW. Her plain orbs have
       just dissolved in `awaken`, and one gold token takes their place until
       her turn comes round. It is `atEnd` for the same reason the three above
       are: this runs on the frame the door shuts. */
    for (const p of result?.winners ?? []) this.earn(p, 'orbs', { atEnd: true });
    /* A celebration still counting down its three seconds is DROPPED, not
       lost: the quest is in `got`, so its token is built right here and it is
       paid with the rest. Holding up a promise on the frame it turns into the
       real thing would be two moments for one quest. */
    this.pending.length = 0;
    for (const p of players) this.syncTokens(p);
    this.gapT = CEREMONY_LEAD;
  }

  /**
   * Is a ceremony owed or running? The arena's door asks this.
   *
   * IT IS OWED RATHER THAN RUNNING, deliberately: between two kittens' turns
   * there is a two-second gap with no card on screen, and a griffin taking off
   * in that gap is exactly the hole this closes.
   */
  get ceremonyBusy() {
    if (this.open) return false;
    return !!this.show
      || (this.game.players ?? []).some((p) => this.unpaid(p).length > 0);
  }

  /* ------------------------------ per frame ------------------------------ */

  update(dt) {
    const g = this.game;
    const busy = !!(g._sceneActive?.() || g._finaleDue);
    if (this.open) this._watch(dt, busy);
    this._celebrate(dt, busy);
    if (!this.open) this._ceremony(dt, busy);
  }

  /**
   * The polled quests. POLLED RATHER THAN HOOKED, the crossfx trick again: a
   * rule that reads `clansSworn`, `panda.spec.rideable` and `ryu.pilot` cannot
   * be missed by the next code path that swears a clan, grows a panda or seats
   * a pilot, and a hook in each of those places could.
   */
  _watch(dt, busy) {
    const g = this.game;
    for (const p of g.players ?? []) {
      const L = this.ledger(p);
      if (p.clansSworn?.size >= CLANS.length) this.earn(p, 'clans', { delay: CELEBRATE_AFTER });
      if (p.panda?.spec?.rideable) this.earn(p, 'panda', { delay: CELEBRATE_AFTER });
      if (g.ryu && g.ryu.pilot === p) this.earn(p, 'pilot', { delay: CELEBRATE_AFTER });

      /* NOT DURING A SCENE. The ending drives the real Dojo with its own
         runners, and a kitten whose body happens to be parked near the circle
         while Patchfur talks has not spent that minute in the lesson. */
      if (!busy && !L.got.includes('dojo') && inDojoView(p, g.world?.dojoCentre)) {
        L.dojoT += dt;
        if (L.dojoT >= DOJO_NEED) this.earn(p, 'dojo');
      }
      if (!busy && !this.claimed.rider && g.ryu && g.ryu.gunner === p) {
        L.riderT += dt;
        if (L.riderT >= RIDER_NEED) {
          this.claimed.rider = p.style?.name ?? p.name ?? '?';
          this.earn(p, 'rider');
        }
      }
    }
    /* THE SEVENTH STAR SETTLES IT. Nobody can find an eighth, so the count
       is final — and the celebration waits for the summoning scene to be over
       ("after Ryuuseki is unlocked, after the cutscene"), which `_celebrate`
       does by refusing while `busy`. */
    if (!this.ballsSettled && (g.ballsHeld ?? 0) >= BALL_COUNT) {
      this.ballsSettled = true;
      for (const p of leaders(g.players ?? [], (q) => this.ledger(q).balls)) {
        this.earn(p, 'balls');
      }
    }
  }

  /** "The game should make a sound, display a message, and ... a different
   *  colored basic kotodama orb but smaller should appear around them." */
  _celebrate(dt, busy) {
    const g = this.game;
    for (let i = this.pending.length - 1; i >= 0; i--) {
      const c = this.pending[i];
      c.t -= dt;
      /* SHE LEFT: drop the moment, keep the quest. It is in her ledger, her
         ledger goes into her row, and her token is rebuilt when she is
         played again. */
      if (!(g.players ?? []).includes(c.player)) { this.pending.splice(i, 1); continue; }
      /* One pose at a time — a star found in the same second is the bigger
         moment, and this one waits for it rather than cutting it short. */
      if (c.t > 0 || busy || c.player.aloftT > 0) continue;
      this.pending.splice(i, 1);
      this._cheer(c.player, c.id);
    }
  }

  _cheer(p, id) {
    const g = this.game;
    const f = FEAT_BY_ID[id];
    g.sfx?.('quest');
    const prize = isSpecial(id)
      ? 'a SPECIAL orb for the ending — it could be a rare one!'
      : 'a free orb for the ending!';
    g.toast?.(`★ QUEST — ${f.title}! ${p.name} earned ${prize}`, p.index);
    this.syncTokens(p);
    /* THE BLESSING, ON FOOT ONLY, AND WITHOUT THE CAMERA. `holdAloft` freezes
       her through the dead pad, which is the "slight pause"; `zoom: false` is
       "camera doesn't need to zoom". A kitten flying, riding, carried or
       knocked out would be drawn with her paws up in mid-air, so she just gets
       the sound, the words and the token — prefer a rule that degrades. */
    const onFoot = !p.mount && !p.rideAlong && !p.pandaMount && !p.carried
      && !p.ko && !p.angel && !g.tournament?.fighting;
    if (onFoot && p.holdAloft) {
      p.holdAloft(null, BLESS_T, { tint: TOKEN_COLOR, zoom: false });
      p.aloft?.material.color.set(TOKEN_COLOR);
    }
  }

  /**
   * The award ceremony: one kitten's whole haul, then the next kitten's.
   *
   * NOTHING RUNS WHILE A SCENE OWNS THE SCREEN — a card behind the ending's
   * letterbox is a card nobody read, and her pose would run out under it. The
   * gap is pushed back out to a full lead-in so the first turn does not land
   * on the frame the finale lets go.
   */
  _ceremony(dt, busy) {
    if (busy) { this.gapT = Math.max(this.gapT, CEREMONY_LEAD); return; }

    if (this.show) {
      /* SHE DROPPED OUT MID-CEREMONY. "Their award ceremony cancelled and will
         just automatically have their awards already equipped" — which is what
         `settleOnLeave` did on her way out, so there is nothing left to give;
         all that happens here is the card coming down. */
      if (!(this.game.players ?? []).includes(this.show.player)) {
        this._closeCard();
        this.gapT = CEREMONY_GAP;
        return;
      }
      this.show.t -= dt;
      if (this.show.t > 0) return;
      this._closeCard();
      this.gapT = CEREMONY_GAP;
      return;
    }

    this.gapT -= dt;
    if (this.gapT > 0) return;
    /* IN SEAT ORDER, because that is the order the panes are in and the order
       their names are read out everywhere else in the game. */
    const next = (this.game.players ?? []).find((p) => this.unpaid(p).length > 0);
    if (!next) { this.gapT = 0; return; }
    this._award(next);
  }

  /**
   * One kitten's turn: every orb she won, at once, with her name on the card.
   *
   * @param rand injectable for world-check
   */
  _award(p, rand = Math.random) {
    const g = this.game;
    const given = [];
    const refused = [];
    for (const id of this.unpaid(p)) {
      const r = this.pay(p, id, rand);
      if (r?.refused) refused.push(FEAT_BY_ID[id]);
      else if (r) given.push({ feat: FEAT_BY_ID[id], spec: r.spec, rare: r.rare });
    }
    const card = this.cardFor(p, given, refused);
    this.show = { player: p, t: card.hold, card };
    this._paintCard(card);
    g.sfx?.('powerorb');

    /* THE BLESSING, WITH THE CAMERA THIS TIME. The token's nod deliberately
       refused the zoom ("camera doesn't need to zoom") because it happens in
       the middle of play; this is the ceremony, the game is over, and the
       pane is hers for three and a half seconds. `holdAloft` freezing her is
       the "pause" — and a kitten flying, riding, carried or knocked out gets
       the card and the sound without a pose, rather than her paws up in
       mid-air. Prefer a rule that degrades. */
    const onFoot = !p.mount && !p.rideAlong && !p.pandaMount && !p.carried
      && !p.ko && !p.angel && !g.tournament?.fighting;
    if (onFoot && p.holdAloft) {
      p.holdAloft(null, CEREMONY_BLESS, { tint: given[0]?.spec.color ?? TOKEN_COLOR });
      p.aloft?.material.color.set(given[0]?.spec.color ?? TOKEN_COLOR);
    }
    return card;
  }

  /**
   * The words on the card, as data — two or three sentences and a chip per orb.
   *
   * PURE, AND SEPARATE FROM THE PAINTING, for the reason every other text in
   * this project is: a sentence that only exists once it is in the DOM cannot
   * be checked, and this one has grammar in it (a list of three, an "and", a
   * singular kitten with one orb).
   */
  cardFor(p, given, refused = []) {
    const names = [...given.map((o) => o.feat.title), ...refused.map((f) => f.title)];
    const rares = given.filter((o) => o.rare);
    const list = (a) => (a.length > 1
      ? `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`
      : a[0] ?? '');
    const n = given.length;
    const sentences = [];
    sentences.push(`${p.name} finished ${names.length === 1 ? 'a quest' : `${names.length} quests`}`
      + `${names.length ? `: ${list(names)}` : ''}.`);
    if (n) {
      sentences.push(n === 1
        ? 'One Kotodama wakes for her.'
        : `${n} Kotodama wake for her, and take their places around her.`);
    }
    /* THE RARE ONE IS ITS OWN SENTENCE. It is the only prize in the game that
       cannot be found in the world, and burying it in a list of three is
       exactly how a nine-year-old misses that she just won the lottery. */
    if (rares.length) {
      sentences.push(`${list(rares.map((o) => `${o.spec.kanji} ${o.spec.name}`))} `
        + `${rares.length === 1 ? 'is a RARE one' : 'are RARE ones'} — the dealer's own!`);
    }
    /* A REFUSAL SAYS SO (sixth non-negotiable). A neck already full is the one
       way a kitten can win a quest and be handed nothing, and silence there
       reads as the game forgetting her. */
    if (refused.length) {
      sentences.push(`There was no room for ${refused.length === 1 ? 'one more' : `${refused.length} more`} — `
        + `she is already wearing ${MAX_EQUIPPED}.`);
    }
    const text = sentences.join(' ');
    const hold = Math.min(CARD_MAX,
      Math.max(CEREMONY_BLESS, CARD_BASE + text.length * CARD_PER_CHAR)) + CARD_EXTRA;
    return {
      player: p,
      name: p.name,
      colour: cssFor(p.style),
      index: p.index ?? 0,
      sentences,
      orbs: given.map((o) => ({
        kanji: o.spec.kanji, name: o.spec.name, colour: hex(o.spec.color), rare: o.rare,
      })),
      refused: refused.length,
      hold,
    };
  }

  /** Put the card on screen. Silently does nothing without a document — the
   *  ceremony's clock, its orbs and its words do not depend on the DOM. */
  _paintCard(card) {
    const el = typeof document !== 'undefined' && document.getElementById?.('award');
    if (!el) return;
    el.className = '';
    el.style.setProperty('--aw-me', card.colour);
    el.innerHTML = `<div class="aw-head">${esc(card.name)}</div>`
      + `<ul class="aw-orbs">${card.orbs.map((o) => '<li class="aw-orb'
        + `${o.rare ? ' rare' : ''}" style="--aw-orb:${o.colour}">`
        + `<span class="aw-kanji">${esc(o.kanji)}</span>`
        + `<span class="aw-oname">${esc(o.name)}</span></li>`).join('')}</ul>`
      + `<div class="aw-text">${card.sentences.map(esc).join(' ')}</div>`;
  }

  _closeCard() {
    this.show = null;
    const el = typeof document !== 'undefined' && document.getElementById?.('award');
    if (el) el.className = 'hidden';
  }

  /**
   * She is leaving (dropped out, or swapped away from in the picker): hand her
   * everything she won, with no ceremony at all.
   *
   * "If a player drops out of the game before receiving their awards, then they
   * will have their award ceremony cancelled and will just automatically have
   * their awards already equipped/assigned." It runs BEFORE `_rememberPlayer`
   * writes her row, so what is written down is the orbs and not the promise —
   * a kitten who comes back is wearing them, and a kitten who does not has
   * still been paid.
   */
  settleOnLeave(p) {
    if (!p || this.open) return 0;
    const owed = this.unpaid(p);
    for (const id of owed) this.pay(p, id);
    if (this.show?.player === p) this._closeCard();
    this.syncTokens(p);
    return owed.length;
  }

  /** Quests she has earned and not yet been paid for, in list order. */
  unpaid(p) {
    const L = this.ledger(p);
    return FEATS.map((f) => f.id)
      .filter((id) => L.got.includes(id) && !L.paid.includes(id));
  }

  /**
   * Turn one token into a real orb. SILENT: the card her turn puts on screen
   * is the only place the ceremony speaks, and this is called once per quest
   * inside one turn.
   *
   * PAID BEFORE IT IS GIVEN, and a full neck is still paid. "It is possible
   * for someone to get more than 8 ... so let's not award them one if they
   * already have 8" — that is a refusal, and the sixth non-negotiable says a
   * refusal is said out loud, which her card does by counting them. Marking it
   * paid either way is what stops a kitten wearing eight from being offered
   * the same orb on every frame of the rest of the game.
   *
   * @param rand injectable for world-check
   */
  pay(p, id, rand = Math.random) {
    const L = this.ledger(p);
    if (!L.got.includes(id) || L.paid.includes(id)) return null;
    L.paid.push(id);
    if ((p.powerOrbs?.length ?? 0) >= MAX_EQUIPPED) {
      this.syncTokens(p);
      return { refused: true };
    }
    const spec = ORB_BY_ID[drawOrb({ rare: isSpecial(id), rand })];
    this.game.kotodama?.give(p, spec.id, { quiet: true });
    this.syncTokens(p);
    return { spec, rare: !!spec.shopOnly };
  }

  /* ---------------------------- the tokens ------------------------------- */

  /** How many promises she should be seen carrying. EVERY unpaid quest leaves
   *  one now, the plain-orb prize included — that prize used to be handed over
   *  on the Awakening frame and so drew no token, which is precisely the thing
   *  that made it look forgotten by the ceremony. */
  tokenCount(p) {
    const L = this.ledger(p);
    const waiting = new Set(this.pending.filter((c) => c.player === p).map((c) => c.id));
    return L.got.filter((id) => !L.paid.includes(id) && !waiting.has(id)).length;
  }

  /**
   * Rebuild her gold tokens, wholesale — the `syncOrbMeshes` argument: each
   * one's orbit is a function of its slot, so patching one in bunches them.
   *
   * THE SAME `Orb` AS THE PLAIN ONES, WITH THE WORKING SWITCHED OFF. It is
   * smaller (so it cannot be mistaken for a lesson) and gold (so it cannot be
   * mistaken for a plain orb). The working is off for the reason it is off on
   * the worn Powerup Kotodama: a second copy of the lesson too small to read
   * teaches nothing and hides the first.
   */
  syncTokens(p) {
    if (!p) return;
    const scene = this.game.scene;
    for (const o of p.featOrbs ?? []) scene?.remove(o.group);
    const n = this.tokenCount(p);
    p.featOrbs = Array.from({ length: n }, (_, k) => {
      const o = new Orb({
        radius: 1.7 + k * 0.22, speed: 1.9 - k * 0.08,
        phase: (k * Math.PI * 2) / Math.max(3, n), color: TOKEN_COLOR,
        height: 2.3 + k * 0.18,
      });
      o.setMathVisible(false);
      o.orbNode.scale.setScalar(0.45);
      scene?.add(o.group);
      return o;
    });
  }

  dropTokens(p) {
    for (const o of p?.featOrbs ?? []) this.game.scene?.remove(o.group);
    if (p) p.featOrbs = [];
  }

  /* ---------------------------- the checklist ---------------------------- */

  /**
   * What the profile screen draws for her: one row per quest, and whether she
   * "currently will get it if the game ends".
   */
  status(p) {
    const g = this.game;
    const players = g.players ?? [];
    const L = this.ledger(p);
    const leading = (valueOf) => leaders(players, valueOf).includes(p);
    return FEATS.map((f) => {
      const got = L.got.includes(f.id);
      const paid = L.paid.includes(f.id);
      let star = got;
      let note = '';
      if (!got && this.open) {
        switch (f.id) {
          case 'dojo': note = `${Math.floor(L.dojoT)}s / ${DOJO_NEED}s`; break;
          case 'clans': note = `${p.clansSworn?.size ?? 0} / ${CLANS.length}`; break;
          case 'rider':
            note = this.claimed.rider ? `${this.claimed.rider} got there first`
              : `${Math.floor(L.riderT)}s / ${RIDER_NEED}s`;
            break;
          case 'mischief':
            star = leading((q) => this.ledger(q).mischief);
            note = `${L.mischief} knocked over${star ? ' — in the lead' : ''}`;
            break;
          case 'balls':
            if (!this.ballsSettled) star = leading((q) => this.ledger(q).balls);
            note = `${L.balls} found${star ? ' — in the lead' : ''}`;
            break;
          case 'orbs': {
            /* THE PLAIN-ORB PRIZE'S OWN RULE, 0-0 INCLUDED — see `Kotodama`.
               A star here that disagreed with who is actually handed the orb
               would be the checklist lying. */
            const counts = players.map((q) => q.orbs?.length ?? 0);
            const mine = p.orbs?.length ?? 0;
            star = mine === Math.max(...counts);
            note = `${mine} collected${star ? ' — in the lead' : ''}`;
            break;
          }
          default: break;
        }
      }
      if (!got && !this.open) note = 'the game has ended';
      return { feat: f, got, paid, star, note, special: f.who !== 'each' };
    });
  }

  /* ------------------------------ save/load ------------------------------ */

  save() {
    return { rider: this.claimed.rider, balls: this.ballsSettled };
  }

  load(s) {
    this.claimed.rider = typeof s?.rider === 'string' ? s.rider : null;
    this.ballsSettled = !!s?.balls;
    this.pending.length = 0;
    this._closeCard();
    this.gapT = CEREMONY_LEAD;
  }

  /** Hand a remembered ledger back — a load, or a kitten played again. No
   *  ceremony: it happened twenty minutes ago and is not news. */
  applyRow(p, r) {
    if (!p) return;
    p.feats = cleanFeats(r);
    this.pending = this.pending.filter((c) => c.player !== p);
    this.syncTokens(p);
  }

  /** A restart: every quest un-done, every token gone. */
  reset() {
    this.claimed.rider = null;
    this.ballsSettled = false;
    this.pending.length = 0;
    this._closeCard();
    this.gapT = CEREMONY_LEAD;
    for (const p of this.game.players ?? []) {
      this.dropTokens(p);
      p.feats = blankFeats();
    }
  }
}
