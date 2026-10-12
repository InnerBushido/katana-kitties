/* ---------------------------------------------------------------------------
   FISHING — Ocarina of Time's fishing pond, in her pane, at her koi pond.

   It is a card that plays a game (`drive` takes her whole pad; START still
   closes, like every card). Four beats, the four OoT has:

     AIM    a power bar swings; JUMP casts. Further is deeper is bigger fish.
     WAIT   the lure sits; nudge the stick to twitch it, which is what makes
            a fish come and look. Big ones are shy: twitch too much and they go.
     BITE   the float dips — JUMP inside the window to set the hook.
     REEL   hold JUMP to reel. The fish pulls; the line's tension climbs while
            you reel against it and falls when you let go. Over the top and the
            line snaps. Bring it in to land it.

   A caught fish is weighed, set against the RECORD BOARD (the biggest of each
   kind, and who caught it — kept in the homes store, so it outlives a game),
   and sold to Roshi for points by weight. NOTHING IS LOST BY FAILING: a
   snapped line is a fish that swam away, and the next cast is free.

   The pond is not the koi. Nobody fishes her pets; these are wild fish that
   visit the pond (a kid would ask, and that is the answer).
--------------------------------------------------------------------------- */

export const FISH = [
  { id: 'ayu', name: 'AYU', min: 0.3, max: 1.2, depth: 0.0, weight: 5, colour: '#9fc4a8' },
  { id: 'yamame', name: 'YAMAME TROUT', min: 0.8, max: 2.5, depth: 0.25, weight: 4, colour: '#c7a7d8' },
  { id: 'carp', name: 'WILD CARP', min: 2, max: 7, depth: 0.45, weight: 3, colour: '#c99a5a' },
  { id: 'namazu', name: 'NAMAZU CATFISH', min: 5, max: 14, depth: 0.65, weight: 2, colour: '#6e6a5a' },
  { id: 'lunker', name: 'HYLIAN LOACH', min: 12, max: 25, depth: 0.85, weight: 0.4, colour: '#e9c46a', rare: true },
];

/** Points per pound, as a fraction of one orb's price. */
export const FISH_VALUE = 0.01;

export function rollFish(depth, rng = Math.random) {
  const pool = FISH.filter((f) => f.depth <= depth + 0.05);
  const total = pool.reduce((a, f) => a + f.weight, 0);
  let r = rng() * total;
  let pick = pool[0];
  for (const f of pool) { r -= f.weight; if (r <= 0) { pick = f; break; } }
  // the bigger end of the range only from the deep end
  const k = Math.min(1, rng() * (0.5 + depth));
  const lb = pick.min + (pick.max - pick.min) * k;
  return { fish: pick, lb: Math.round(lb * 10) / 10 };
}

export class Fishing {
  constructor(housing, p, H) {
    this.H = housing;
    this.p = p;
    this.home = H;
    this.reset();
  }

  reset() {
    this.state = 'aim';
    this.t = 0;
    this.power = 0;
    this.dir = 1;
    this.depth = 0;
    this.lure = 0;
    this.interest = 0;
    this.biteAt = 0;
    this.tension = 0;
    this.dist = 1;
    this.catch = null;
    this.msg = 'JUMP to cast!';
  }

  /** One frame with her pad. */
  step(pad, dt) {
    this.t += dt;
    const jumpP = pad.pressed('jump');
    if (jumpP) pad.consume?.('jump');
    const tap = this._tap;
    this._tap = false;
    const press = jumpP || tap;
    const hold = pad.down?.('jump') || this._holdT > 0;
    this._holdT = Math.max(0, (this._holdT ?? 0) - dt);
    switch (this.state) {
      case 'aim':
        this.power += this.dir * dt * 1.1;
        if (this.power > 1) { this.power = 1; this.dir = -1; }
        if (this.power < 0) { this.power = 0; this.dir = 1; }
        if (press) {
          this.depth = this.power;
          this.state = 'wait';
          this.t = 0;
          this.interest = 0;
          this.target = rollFish(this.depth);
          this.msg = 'Twitch the lure with the stick…';
          this.H.game.audio?.play?.('jump');
        }
        break;
      case 'wait': {
        const tw = Math.abs(pad.mx ?? 0) + Math.abs(pad.my ?? 0);
        const shy = this.target.fish.depth;
        this.lure = tw > 0.3 ? Math.min(1, this.lure + dt * 3) : Math.max(0, this.lure - dt * 2);
        // A gentle twitch builds interest; thrashing scares the shy ones.
        if (tw > 0.3 && tw < 1.3) this.interest += dt * (0.5 - shy * 0.2);
        else if (tw >= 1.3) this.interest -= dt * shy * 0.8;
        else this.interest += dt * 0.08;
        if (this.interest < -0.3) {
          this.target = rollFish(Math.max(0, this.depth - 0.3));
          this.interest = 0;
          this.msg = 'Too much splashing! A smaller fish comes instead…';
        }
        if (this.interest >= 1) {
          this.state = 'bite';
          this.biteAt = this.t;
          this.msg = 'BITE! Press JUMP!';
          this.H.game.audio?.play?.('beat');
        }
        if (press && this.t > 0.4) { this.reset(); this.msg = 'Reeled in empty. JUMP to cast again!'; }
        break;
      }
      case 'bite':
        if (press) {
          this.state = 'reel';
          this.dist = 1;
          this.tension = 0.2;
          this.msg = 'HOOKED! Hold JUMP to reel — watch the line!';
          this.H.game.audio?.play?.('great');
        } else if (this.t - this.biteAt > 0.9) {
          this.state = 'wait';
          this.interest = 0.3;
          this.msg = 'Too slow — it let go. Keep twitching…';
        }
        break;
      case 'reel': {
        const f = this.target;
        const pull = 0.25 + (f.lb / 25) * 0.9;
        const surge = Math.max(0, Math.sin(this.t * (2 + f.lb * 0.1)) ) * pull;
        if (hold) {
          this.dist -= dt * (0.22 - surge * 0.1);
          this.tension += dt * (0.25 + surge * 0.9);
        } else {
          this.dist += dt * surge * 0.12;
          this.tension -= dt * 0.7;
        }
        this.tension = Math.max(0, this.tension);
        if (this.tension >= 1) {
          this.state = 'done';
          this.catch = null;
          this.msg = `SNAP! The ${f.fish.name} got away. JUMP to cast again.`;
          this.H.game.audio?.play?.('miss');
        } else if (this.dist <= 0) {
          this.state = 'done';
          this.catch = f;
          this._land(f);
        }
        this.dist = Math.min(1.2, this.dist);
        if (this.dist >= 1.2) {
          this.state = 'done';
          this.msg = 'It swam off with plenty of line. JUMP to cast again.';
        }
        break;
      }
      case 'done':
        if (press && this.t > 0.3) this.reset();
        break;
    }
  }

  _land(f) {
    const G = this.H.game;
    const S = this.H.store;
    S.records ??= {};
    S.records.fish ??= {};
    const rec = S.records.fish[f.fish.id];
    const best = !rec || f.lb > rec.lb;
    if (best) S.records.fish[f.fish.id] = { lb: f.lb, who: this.p.style.name, at: Date.now() };
    const pts = Math.max(5, Math.round(this.H.price(FISH_VALUE) * f.lb));
    this.p.score += pts;
    G.onScoreChanged?.(this.p);
    this.H.save();
    G.audio?.play?.('perfect');
    this.msg = `${f.fish.rare ? 'RARE! ' : ''}${f.fish.name}, ${f.lb} lb${best ? ' — A NEW RECORD!' : ''} Roshi pays ${pts}. JUMP to cast again.`;
  }

  /** A tap on the touch REEL button. */
  tap() {
    this._tap = true;
    this._holdT = 0.25;
  }

  draw(canvas) {
    if (!canvas) return;
    const g = canvas.getContext('2d');
    const W = canvas.width;
    const Hh = canvas.height;
    g.clearRect(0, 0, W, Hh);
    // water
    const grad = g.createLinearGradient(0, 40, 0, Hh);
    grad.addColorStop(0, '#5fa8c8');
    grad.addColorStop(1, '#173b5a');
    g.fillStyle = grad;
    g.fillRect(0, 40, W, Hh - 40);
    g.fillStyle = '#8fc46a';
    g.fillRect(0, 30, W, 12);
    // her on the bank and the line
    const bx = 20;
    const by = 30;
    const lx = 40 + (this.state === 'aim' ? 0 : this.depth) * (W - 80);
    const ly = 44 + (this.state === 'reel' ? (1 - Math.max(0, this.dist)) * 0 : 0);
    g.strokeStyle = '#3a2a1a';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + 18, by - 22); g.stroke();
    if (this.state !== 'aim') {
      const fx = this.state === 'reel' || this.state === 'done' ? bx + 18 + (lx - bx - 18) * Math.max(0, this.dist) : lx;
      const dip = this.state === 'bite' ? Math.sin(this.t * 30) * 4 + 4 : Math.sin(this.t * 3) * 1.5 + this.lure * 2;
      g.strokeStyle = this.tension > 0.75 ? '#ff4040' : '#f2f2f2';
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(bx + 18, by - 22); g.lineTo(fx, ly + dip); g.stroke();
      g.fillStyle = '#ff5a3a';
      g.beginPath(); g.arc(fx, ly + dip, 4, 0, Math.PI * 2); g.fill();
      if (this.state === 'reel' || (this.state === 'done' && this.catch)) {
        g.fillStyle = this.target.fish.colour;
        const s = 8 + this.target.lb * 0.8;
        g.beginPath(); g.ellipse(fx, ly + 14 + s * 0.3, s, s * 0.4, 0, 0, Math.PI * 2); g.fill();
      } else if (this.state === 'wait' || this.state === 'bite') {
        // the shadow coming to look
        const k = Math.max(0, Math.min(1, this.interest));
        g.fillStyle = 'rgba(0,0,0,0.35)';
        const s = 6 + this.target.lb * 0.7;
        g.beginPath(); g.ellipse(fx + (1 - k) * 60, ly + 22 + this.depth * 60, s, s * 0.4, 0, 0, Math.PI * 2); g.fill();
      }
    }
    // bars
    if (this.state === 'aim') {
      g.fillStyle = '#222';
      g.fillRect(W - 110, 8, 100, 12);
      g.fillStyle = '#ffd34a';
      g.fillRect(W - 110, 8, 100 * this.power, 12);
      g.fillStyle = '#fff';
      g.font = 'bold 11px sans-serif';
      g.fillText('POWER', W - 150, 18);
    }
    if (this.state === 'reel') {
      g.fillStyle = '#222';
      g.fillRect(W - 110, 8, 100, 12);
      g.fillStyle = this.tension > 0.75 ? '#ff4040' : '#7fe07f';
      g.fillRect(W - 110, 8, 100 * Math.min(1, this.tension), 12);
      g.fillStyle = '#fff';
      g.font = 'bold 11px sans-serif';
      g.fillText('LINE', W - 140, 18);
    }
  }
}
