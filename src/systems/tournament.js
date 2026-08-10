import { MAX_HP, KO_TIME } from '../entities/player.js';
import { scoreOf, saveResult, loadBoard, NameEntry, ALPHABET, NAME_MAX } from './leaderboard.js';

/* ---------------------------------------------------------------------------
   The World Martial Arts Tournament.

   Owns exactly one question that the rest of the game asks: `fighting` — may
   these two kittens hurt each other right now? Everything else here is the
   ceremony around it.

   BEST OF THREE, NOT THREE ROUNDS. Two round wins takes it, so a tournament
   is two or three rounds long. Playing a dead third round after a 2-0 is
   worse than it sounds: the girls have already been told who won, and the
   round card that opens it says "everything comes down to this one", which by
   then is a lie. The third round only happens at one apiece, which is exactly
   when that line is true.

   NOTHING HERE IS A FULL-SCREEN SCENE. Round starts are a banner over the
   live world with both fighters visibly standing on their marks, because the
   thing the screen most needs to show at that moment is the two of them on
   opposite sides of a ring. The two moments that DO take the screen — the
   tournament opening and the result — are the two that are about something
   other than the fight.
--------------------------------------------------------------------------- */

/** Round wins needed to take the tournament, and the most rounds it can run. */
export const WINS_NEEDED = 2;
export const MAX_ROUNDS = 3;

/** Seconds the round card holds before the countdown starts. */
const CARD_TIME = 3.4;
/** Seconds of "3 … 2 … 1 …". One a second, so the ticks land on the numbers. */
const COUNT_FROM = 3;
/** Held on the knockout before the next round is set up. */
const KO_HOLD = KO_TIME + 1.4;
/** A round cannot run forever — see `_updateLive`. */
const ROUND_LIMIT = 120;

/**
 * A ring-out: what it costs, and how long you have to be off before it counts.
 *
 * IT HURTS RATHER THAN ENDING THE ROUND, which is the single biggest balance
 * decision in this feature. Falling off is the loss condition in Smash and in
 * the DBZ tournament both, and it is genuinely the more exciting rule — but
 * this game already has health bars, and two loss conditions where one is
 * instant means a nine-year-old watching her sister's bar go down can still
 * lose the round in a frame she did not understand. One currency, one bar,
 * one way to lose. The ring still matters because 30 is a third of it.
 *
 * The GRACE is what makes it fair. A fighter is a point and the deck edge is
 * a line, so a knockback that clips the corner would fire instantly; half a
 * second is long enough to scramble back on and short enough that standing
 * off the stage is never a tactic.
 */
const OUT_GRACE = 0.5;
const OUT_DAMAGE = 30;

export class Tournament {
  constructor({ game, world, audio, announcer }) {
    this.game = game;
    this.world = world;
    this.audio = audio;
    this.announcer = announcer;

    /** off | card | count | live | ko | result | leaving */
    this.state = 'off';
    this.t = 0;
    this.round = 0;
    /** Round wins, by player index. */
    this.wins = [0, 0];
    /** Total seconds actually spent fighting — the speed term of the score. */
    this.fightTime = 0;
    this.winner = null;
    this.entry = new NameEntry();
    this.board = loadBoard();
    this.rank = -1;

    this.bannerEl = document.getElementById('arena-banner');
    this.hudEl = document.getElementById('arena-hud');
    this.resultEl = document.getElementById('arena-result');
  }

  /* ------------------------------ questions ------------------------------ */

  /**
   * MAY THE TWO OF THEM HURT EACH OTHER RIGHT NOW?
   *
   * The one gate, read by `Game.strikePlayers` and by nothing else. It is
   * deliberately narrow: not "are we at the arena", not "is a tournament
   * running", but "is a round LIVE this frame". The countdown, the round card,
   * the knockout hold and the results screen are all tournament states in
   * which a swing must do nothing at all — the countdown especially, because
   * a kitten mashing attack while the numbers come down would otherwise open
   * with a free hit on a sister who cannot move.
   */
  get fighting() { return this.state === 'live'; }

  /** True from the moment they board the griffin until they are home. */
  get active() { return this.state !== 'off'; }

  /** True while the tournament owns the whole screen (results + name entry). */
  get modal() { return this.state === 'result'; }

  /* ------------------------------- flow ---------------------------------- */

  /** Both kittens have landed at the arena. Start the show. */
  begin() {
    this.state = 'card';
    this.round = 0;
    this.wins = [0, 0];
    this.fightTime = 0;
    this.winner = null;
    this.rank = -1;
    this.entry.reset();
    for (const p of this.game.players) {
      p.dmgDealt = 0;
      p.dmgTaken = 0;
      p.hpGroup.visible = true;
    }
    this.hudEl?.classList.remove('hidden');
    this._nextRound();
  }

  /** Tear it all down — used on restart, and when the girls go home. */
  finish() {
    this.state = 'off';
    this.announcer?.clear();
    this.bannerEl?.classList.add('hidden');
    this.hudEl?.classList.add('hidden');
    this.resultEl?.classList.add('hidden');
    for (const p of this.game.players) {
      p.hpGroup.visible = false;
      p.hp = p.maxHp;
      p.ko = false;
      p.koT = 0;
      p.hitT = 0;
      p.invulnT = 0;
      p.outT = 0;
      /* Cleared, or the edge warning latches on. `_updateOut` is the only
         thing that ever sets `nearEdge` false again, and it stops running the
         moment the tournament does — so a kitten who flew home from the last
         thing she did near the rim would keep a flashing red ring round her
         feet for the rest of the afternoon. */
      p.nearEdge = false;
    }
  }

  _nextRound() {
    this.round++;
    this.t = 0;
    this.state = 'card';

    /* POSTED ON OPPOSITE SIDES, FACING EACH OTHER, AND FROZEN.
       `resetForRound` puts each of them on her mark with full health and no
       timers, and the `card`/`count` states feed a dead pad (see `frozen`) so
       neither can move until the gong. Two kittens standing still on opposite
       sides of a ring is the picture that says "this is a duel" — and it is
       also the only moment either girl gets to see where her sister is
       before it starts. */
    const posts = this.world.arenaPosts;
    this.game.players.forEach((p, i) => {
      const post = posts[i] ?? posts[0];
      const other = posts[1 - i] ?? posts[0];
      // Facing is atan2(x, z) in this game — 0 is +Z. Point her at the other.
      const facing = Math.atan2(other.x - post.x, other.z - post.z);
      p.resetForRound(post.x, post.y, post.z, facing);
    });

    const last = this.round === MAX_ROUNDS;
    this.announcer?.say(`sat_r${this.round}`, last
      ? 'FINAL ROUND! Everything comes down to this one!'
      : `ROUND ${this.round}! Ember versus Frost — fighters, take your marks!`);
    this._banner(last ? 'FINAL ROUND' : `ROUND ${this.round}`, 'round');
  }

  /**
   * True while the fighters must not be able to move.
   *
   * Read by `Game`, which swaps in a dead pad — the same mechanism the star
   * pose and hit-stun use, so none of the three movement modes has to know
   * that a tournament exists.
   */
  get frozen() {
    return this.state === 'card' || this.state === 'count'
      || this.state === 'ko' || this.state === 'result';
  }

  /* ------------------------------ events --------------------------------- */

  /** A blow landed. Called from Game.strikePlayers, after the damage. */
  onHit(attacker, target, dealt, kind) {
    this.game.hitSpark?.(target, kind);
    if (!target.ko) return;
    this._roundOver(attacker.index, `${attacker.name} knocks ${target.name} down!`);
  }

  _roundOver(winnerIndex, message) {
    if (this.state !== 'live') return;
    this.state = 'ko';
    this.t = 0;
    this.wins[winnerIndex]++;
    this.announcer?.say('sat_ko', 'DOWN! Oh, that had to hurt!');
    this._banner('K.O.', 'ko');
    this.game.toast(message, winnerIndex);
  }

  /* ------------------------------ update --------------------------------- */

  update(dt, pads) {
    if (this.state === 'off') return;

    this.t += dt;
    this._paintHud();

    switch (this.state) {
      case 'card':
        if (this.t >= CARD_TIME) {
          this.state = 'count';
          this.t = 0;
          this._counted = COUNT_FROM + 1;
        }
        break;

      case 'count': {
        /* One tick a second, fired on the SECOND it belongs to rather than
           on a timer per number. Counting down by decrementing on an elapsed
           threshold drifts against the clock the banner is showing, and the
           gong landing a frame after "1" has left the screen is the one
           moment in this whole feature that has to be exact. */
        const left = Math.ceil(COUNT_FROM - this.t);
        if (left < this._counted && left > 0) {
          this._counted = left;
          this.audio?.play('count');
          this._banner(String(left), 'count');
        }
        if (this.t >= COUNT_FROM) {
          this.state = 'live';
          this.t = 0;
          this.audio?.play('gong');
          this.announcer?.say('sat_fight', 'FIGHT!');
          this._banner('FIGHT!', 'fight');
        }
        break;
      }

      case 'live':
        this.fightTime += dt;
        this._updateOut(dt);
        /* A round that never ends. Two kittens who are both bored, or one
           who has climbed the announcer's box and is sitting on it, would
           otherwise hold the tournament open forever with no way out but the
           pause menu. Whoever has done the most damage takes it — the honest
           reading of who was winning. */
        if (this.t > ROUND_LIMIT) {
          const [a, b] = this.game.players;
          const lead = a.dmgDealt === b.dmgDealt ? -1 : (a.dmgDealt > b.dmgDealt ? 0 : 1);
          if (lead < 0) {
            this.state = 'ko';
            this.t = 0;
            this._banner('DRAW', 'ko');
            this.game.toast('Time! Nobody landed enough — the round is a draw', 0);
          } else {
            this._roundOver(lead, `Time! ${this.game.players[lead].name} was ahead on damage`);
          }
        }
        break;

      case 'ko':
        if (this.t >= KO_HOLD) {
          const decided = this.wins.some((w) => w >= WINS_NEEDED);
          if (decided || this.round >= MAX_ROUNDS) this._finishTournament();
          else this._nextRound();
        }
        break;

      case 'result':
        this._updateResult(dt, pads);
        break;

      default:
        break;
    }

    this._updateBanner(dt);
  }

  /**
   * Off the deck: a warning, then a price.
   *
   * The warning matters more than the damage. `arenaOutBy` returns a signed
   * distance rather than a boolean precisely so this can start shouting a
   * couple of units BEFORE the line — a penalty that arrives with no build-up
   * reads as the game taking health off you for no reason, and the whole
   * point of the painted border is that the rule is visible.
   */
  _updateOut(dt) {
    for (const p of this.game.players) {
      if (p.ko) continue;
      const out = this.world.arenaOutBy(p.position.x, p.position.z);
      p.nearEdge = out > -3.5 && out <= 0;

      if (out <= 0) { p.outT = 0; continue; }
      p.outT = (p.outT ?? 0) + dt;
      if (p.outT < OUT_GRACE) continue;

      p.outT = 0;
      const R = this.world.arenaRing;
      /* Thrown back toward the MIDDLE, not to her post. Her post is on one
         side of a 56-unit square and she went off some other edge; sending
         her there can drop her straight back out of the far side, and it also
         hands her a free retreat across the ring. */
      /* `pierce` — the ward does not stop the edge of the world. Without it a
         kitten wearing the orb parks herself off the side of the ring and
         takes nothing for the whole round, because the bubble runs longer
         than its own cooldown. See Player.hurt. */
      const dealt = p.hurt(
        OUT_DAMAGE, { x: R.x, z: R.z }, { knock: 0, lift: 0, pierce: true }, this.game
      );
      p.position.set(R.x, R.y + 3, R.z);
      p.group.position.copy(p.position);
      p.velocity.set(0, 0, 0);
      p.camTarget.copy(p.position);
      /* Longer than an ordinary hit's invulnerability. She is being dropped
         back into the middle of the ring next to somebody who is already
         swinging, and landing straight into a free combo is exactly the sort
         of thing that reads as the game cheating. */
      p.invulnT = Math.max(p.invulnT, 1.5);
      this.audio?.play('ringout');
      this._banner('RING OUT!', 'ko');
      this.game.toast(`${p.name} was thrown out of the ring! −${dealt}`, p.index);
      if (p.ko) {
        this._roundOver(1 - p.index, `${p.name} is out — the round goes to ${this.game.players[1 - p.index].name}`);
      }
    }
  }

  /* ------------------------------ the end -------------------------------- */

  _finishTournament() {
    this.state = 'result';
    this.t = 0;
    const wi = this.wins[0] === this.wins[1]
      /* A dead heat is possible: three rounds, one of them a draw on the
         clock. Damage decides it, and if that is level too the tournament is
         a draw and nobody signs the board — which is a real outcome and has
         to be said out loud rather than silently crowning player 1. */
      ? (this.game.players[0].dmgDealt === this.game.players[1].dmgDealt
        ? -1 : (this.game.players[0].dmgDealt > this.game.players[1].dmgDealt ? 0 : 1))
      : (this.wins[0] > this.wins[1] ? 0 : 1);

    this.winner = wi < 0 ? null : this.game.players[wi];
    this.entry.reset();

    if (this.winner) {
      this.score = scoreOf({
        wins: this.wins[wi],
        dealt: this.winner.dmgDealt,
        taken: this.winner.dmgTaken,
        seconds: this.fightTime,
        rounds: this.round,
        maxHp: MAX_HP,
      });
      this.audio?.play('victory');
      this.announcer?.say('sat_win1', 'AND THAT IS THE MATCH! What a display!');
      this.announcer?.say('sat_win2', 'Put your name on my board, champion. It stays there.');
    } else {
      this.score = 0;
    }
    this._paintResult();
    this.resultEl?.classList.remove('hidden');
    this.hudEl?.classList.add('hidden');
    this.bannerEl?.classList.add('hidden');
  }

  _updateResult(dt, pads) {
    if (!this.winner) {
      // A draw signs nothing. Any button sends them home.
      if (pads.some((p) => p.pressed('jump'))) this.goHome();
      return;
    }
    if (this.entry.done) {
      if (pads.some((p) => p.pressed('jump'))) this.goHome();
      return;
    }
    const { moved, confirmed } = this.entry.update(dt, pads);
    if (moved) this.audio?.play('menu');
    if (confirmed) this._commit();
    if (moved || confirmed) this._paintResult();
  }

  /** Keyboard route into the same name entry. */
  key(code) {
    if (this.state !== 'result' || !this.winner || this.entry.done) return false;
    if (!this.entry.key(code)) return false;
    if (this.entry.done) this._commit();
    this._paintResult();
    return true;
  }

  _commit() {
    const w = this.winner;
    const saved = saveResult({
      name: this.entry.name,
      score: this.score,
      wins: this.wins[w.index],
      dealt: Math.round(w.dmgDealt),
      taken: Math.round(w.dmgTaken),
      seconds: Math.round(this.fightTime),
    });
    this.board = saved.rows;
    this.rank = saved.rank;
    this.audio?.play('clan');
  }

  /** Send them back to the town. The griffin does the travelling. */
  goHome() {
    this.state = 'leaving';
    this.resultEl?.classList.add('hidden');
    this.game.leaveArena?.();
  }

  /* ------------------------------ the camera ----------------------------- */

  /**
   * Where the shared camera wants to be, or null to leave it alone.
   *
   * IT HAS TO BE ITS OWN RIG, because the ordinary one cannot frame this. The
   * merged camera sizes its distance as `clamp(26 + separation * 0.85, 26, 52)`
   * — a clamp written for two kittens running around a town, and the ring is
   * 56 units across, so at full separation it tops out framing about half of
   * it and one of the two fighters is off screen. Same trap Ryuuseki fell
   * into, and the same fix: a rig that knows how big its own subject is.
   *
   * It tracks the MIDPOINT rather than the ring's centre, so the pair stay
   * large on screen when they close — that dynamic push-in is most of what
   * makes a fighting game read — but the distance is floored high enough that
   * the edge of the deck is always somewhere on screen. A fighter who cannot
   * see how much ring is behind her cannot avoid a ring-out.
   */
  cameraWant() {
    if (!this.active || this.state === 'result' || this.state === 'leaving') return null;
    const [a, b] = this.game.players;
    const R = this.world.arenaRing;
    const sep = Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);

    /* Pulled toward the middle of the ring rather than sitting on the
       midpoint. With both fighters in one corner, a pure midpoint camera
       looks at that corner and three quarters of the screen is the island
       outside the ring. */
    const midX = (a.position.x + b.position.x) / 2;
    const midZ = (a.position.z + b.position.z) / 2;
    const k = 0.42;
    return {
      x: midX + (R.x - midX) * k,
      y: R.y + 2.4,
      z: midZ + (R.z - midZ) * k,
      // 52 frames a close exchange; 104 holds the whole square at full
      // spread with air around it. Measured against the deck: the diagonal of
      // a 56-unit square is 79, and a camera at 79 puts a fighter in each
      // corner of the frame with nothing to spare.
      dist: Math.min(104, Math.max(52, 46 + sep * 0.8)),
      /* FLATTER THAN THE WALKING CAMERA, because the fight is horizontal and
         these are billboards. The first pass looked down at 0.72 and filled
         two thirds of the screen with an empty stone floor while squashing
         both fighters — steep pitches flatten a yaw-only billboard, which is
         the same reason the grotto camera could not simply tilt over a wall.
         The round card is a fraction higher so the whole ring reads once,
         before the fight makes the middle of it the only thing that matters. */
      pitch: this.state === 'card' ? 0.60 : 0.52,
    };
  }

  /* -------------------------------- HUD ---------------------------------- */

  _banner(text, kind) {
    this._bannerText = text;
    this._bannerT = kind === 'count' ? 0.9 : kind === 'fight' ? 1.1 : 2.4;
    if (!this.bannerEl) return;
    this.bannerEl.textContent = text;
    this.bannerEl.className = `banner-${kind}`;
    this.bannerEl.classList.remove('hidden');
  }

  _updateBanner(dt) {
    if (this._bannerT == null) return;
    this._bannerT -= dt;
    if (this._bannerT <= 0) {
      this._bannerT = null;
      this.bannerEl?.classList.add('hidden');
    }
  }

  _paintHud() {
    if (!this.hudEl || this.state === 'result') return;
    const [a, b] = this.game.players;
    const pips = (i) => Array.from({ length: WINS_NEEDED }, (_, k) => (
      `<i class="${k < this.wins[i] ? 'won' : ''}"></i>`
    )).join('');
    const bar = (p) => {
      const k = Math.max(0, p.hp / p.maxHp);
      const cls = k > 0.34 ? '' : k > 0.18 ? ' warn' : ' crit';
      return `<div class="ah-bar"><span class="ah-fill${cls}" style="width:${k * 100}%"></span></div>`;
    };
    this.hudEl.innerHTML = `
      <div class="ah-side p0">
        <div class="ah-name">${a.name}<span class="ah-pips">${pips(0)}</span></div>
        ${bar(a)}
      </div>
      <div class="ah-mid">ROUND ${this.round}</div>
      <div class="ah-side p1">
        <div class="ah-name"><span class="ah-pips">${pips(1)}</span>${b.name}</div>
        ${bar(b)}
      </div>`;
  }

  _paintResult() {
    if (!this.resultEl) return;
    const rows = this.board.map((r, i) => `
      <tr class="${i === this.rank ? 'me' : ''}">
        <td class="lb-rank">${i + 1}</td>
        <td class="lb-name">${escapeHtml(r.name)}</td>
        <td class="lb-score">${r.score}</td>
        <td class="lb-detail">${r.wins}W · ${r.dealt} dealt · ${r.taken} taken · ${r.seconds}s</td>
      </tr>`).join('') || '<tr><td colspan="4" class="lb-empty">No champions yet.</td></tr>';

    if (!this.winner) {
      this.resultEl.innerHTML = `
        <div class="ar-box">
          <h2>A DRAW</h2>
          <p class="ar-sub">Nobody could be separated. Mr. Satan is delighted — it means he is still the champion.</p>
          <table class="lb">${rows}</table>
          <p class="ar-hint">PRESS JUMP TO FLY HOME</p>
        </div>`;
      return;
    }

    const w = this.winner;
    const slots = this.entry.done ? '' : this.entry.slots.map((ix, i) => `
      <span class="ne-slot${i === this.entry.cursor ? ' on' : ''}">${
      ALPHABET[ix] === ' ' ? '&nbsp;' : ALPHABET[ix]}</span>`).join('');

    this.resultEl.innerHTML = `
      <div class="ar-box">
        <h2 class="ar-win p${w.index}">${w.name} WINS THE TOURNAMENT</h2>
        <div class="ar-stats">
          <span><b>${this.wins[w.index]}</b> rounds won</span>
          <span><b>${Math.round(w.dmgDealt)}</b> damage dealt</span>
          <span><b>${Math.round(w.dmgTaken)}</b> damage taken</span>
          <span><b>${Math.round(this.fightTime)}s</b> to do it</span>
        </div>
        <div class="ar-score">SCORE <b>${this.score}</b></div>
        ${this.entry.done ? `
          <p class="ar-sub">${this.rank >= 0
            ? `Signed in at number ${this.rank + 1}.`
            : 'Not quite a top-ten score — the board keeps the best ten.'}</p>`
        : `
          <div class="ne">
            <p class="ne-label">SIGN THE BOARD — stick up/down picks a letter, left/right moves</p>
            <div class="ne-slots">${slots}</div>
            <p class="ne-hint">${NAME_MAX} letters max · JUMP or ENTER when you're done</p>
          </div>`}
        <table class="lb">${rows}</table>
        ${this.entry.done ? '<p class="ar-hint">PRESS JUMP TO FLY HOME</p>' : ''}
      </div>`;
  }
}

/** Names come from a player typing them, so they are escaped before HTML. */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}
