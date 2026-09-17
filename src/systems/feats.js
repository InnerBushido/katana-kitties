import { Orb } from '../entities/orb.js';
import { ORB_BY_ID, MAX_EQUIPPED, drawOrb } from '../entities/powerorb.js';
import { BALL_COUNT } from '../entities/dragonball.js';
import { CLANS } from '../world/world.js';
import { inDojoView } from './mathdojo.js';

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
   Awakening every token turns into a real one, ONE AT A TIME, so each is a
   moment rather than eight toasts in a pile.

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
/** The payout's pace: a beat before the first, and a gap between each. */
export const PAY_LEAD = 1.5;
export const PAY_GAP = 0.9;
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
 * `paidByAwaken` marks the one quest `Kotodama.awaken` already pays itself.
 * It is on the list because it IS one of the ways, and a Help page that listed
 * eight of nine would teach the wrong number.
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
    short: 'Orb collector', how: 'Collect more Kotodama Orbs than anybody else.',
    paidByAwaken: true },
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
    this.payT = PAY_LEAD;
    this._payFrom = 0;
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
   * @param result `Kotodama.awaken`'s return — the plain-orb prize, which it
   *   has already paid, recorded here so the checklist ticks it
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
    for (const { player } of result?.prizes ?? []) {
      const L = this.ledger(player);
      if (!L.got.includes('orbs')) L.got.push('orbs');
      if (!L.paid.includes('orbs')) L.paid.push('orbs');
    }
    /* A celebration still counting down its three seconds is DROPPED, not
       lost: the quest is in `got`, so its token is built right here and it is
       paid with the rest. Holding up a promise on the frame it turns into the
       real thing would be two moments for one quest. */
    this.pending.length = 0;
    for (const p of players) this.syncTokens(p);
    this.payT = PAY_LEAD;
  }

  /* ------------------------------ per frame ------------------------------ */

  update(dt) {
    const g = this.game;
    const busy = !!(g._sceneActive?.() || g._finaleDue);
    if (this.open) this._watch(dt, busy);
    this._celebrate(dt, busy);
    if (!this.open) this._pay(dt, busy);
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
   * One token at a time turns into a Powerup Kotodama, round the party.
   *
   * ROUND THE PARTY, NOT KITTEN BY KITTEN, so the girl with one quest is not
   * watching her sister's eight go off before her own.
   */
  _pay(dt, busy) {
    if (busy) { this.payT = Math.max(this.payT, PAY_LEAD); return; }
    this.payT -= dt;
    if (this.payT > 0) return;
    const players = this.game.players ?? [];
    for (let k = 0; k < players.length; k++) {
      const p = players[(this._payFrom + k) % players.length];
      const id = this.unpaid(p)[0];
      if (!id) continue;
      this._payFrom = (this._payFrom + k + 1) % players.length;
      this.pay(p, id);
      this.payT = PAY_GAP;
      return;
    }
    this.payT = PAY_GAP;
  }

  /** Quests she has earned and not yet been paid for, in list order. */
  unpaid(p) {
    const L = this.ledger(p);
    return FEATS.map((f) => f.id)
      .filter((id) => L.got.includes(id) && !L.paid.includes(id));
  }

  /**
   * Turn one token into a real orb.
   *
   * PAID BEFORE IT IS GIVEN, and a full neck is still paid. "It is possible
   * for someone to get more than 8 ... so let's not award them one if they
   * already have 8" — that is a refusal, and the sixth non-negotiable says a
   * refusal is said out loud. Marking it paid either way is what stops a
   * kitten wearing eight from being refused once every 0.9 seconds forever.
   *
   * @param rand injectable for world-check
   */
  pay(p, id, rand = Math.random) {
    const g = this.game;
    const L = this.ledger(p);
    if (!L.got.includes(id) || L.paid.includes(id)) return null;
    L.paid.push(id);
    const f = FEAT_BY_ID[id];
    if ((p.powerOrbs?.length ?? 0) >= MAX_EQUIPPED) {
      this.syncTokens(p);
      g.sfx?.('deny');
      g.toast?.(`${f.short}: ${p.name} is already wearing ${MAX_EQUIPPED} orbs — `
        + 'no room for this one.', p.index);
      return { refused: true };
    }
    const spec = ORB_BY_ID[drawOrb({ rare: isSpecial(id), rand })];
    g.kotodama?.give(p, spec.id, { quiet: true });
    this.syncTokens(p);
    g.sfx?.('powerorb');
    g.toast?.(`★ ${f.short} — ${p.name} is given ${spec.name} ${spec.kanji}`
      + (spec.shopOnly ? ' — a RARE ONE!' : `! ${spec.blurb}`), p.index);
    return { spec, rare: !!spec.shopOnly };
  }

  /* ---------------------------- the tokens ------------------------------- */

  /** How many promises she should be seen carrying. */
  tokenCount(p) {
    const L = this.ledger(p);
    const waiting = new Set(this.pending.filter((c) => c.player === p).map((c) => c.id));
    return L.got.filter((id) => !FEAT_BY_ID[id].paidByAwaken
      && !L.paid.includes(id) && !waiting.has(id)).length;
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
    this.payT = PAY_LEAD;
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
    this.payT = PAY_LEAD;
    this._payFrom = 0;
    for (const p of this.game.players ?? []) {
      this.dropTokens(p);
      p.feats = blankFeats();
    }
  }
}
