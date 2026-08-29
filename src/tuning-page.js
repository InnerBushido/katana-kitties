/**
 * The balance page's brain. Entered only from `tuning.html` — see the comment
 * at the top of that file for what this is and why it is not in the game.
 *
 * IT IMPORTS THE ENTITY MODULES FOR THEIR SIDE EFFECT, and that is the whole
 * trick that keeps this page honest. `tune()` records each table it is handed
 * into `DEFAULTS` as the module holding it is evaluated, so importing
 * `powerorb.js` and `player.js` is what populates the list of everything
 * tunable. Nothing below re-states a game number: the shipped value comes from
 * `DEFAULTS`, the live value comes from `DEFAULTS` folded with the saved
 * overrides, and a field this page has never heard of still shows up as long
 * as somebody wrapped it in `tune()`.
 *
 * WHAT IS WRITTEN HERE AND NOWHERE ELSE is SCHEMA: a sentence per field, a
 * unit, and a sensible slider range. That is not duplication of the code
 * comments, it is a different document for a different moment — the comments
 * explain why a number is what it is and are read while changing code; these
 * explain what a number does and are read while dragging. A field with no
 * schema entry still renders, with its raw name and a generous range, so
 * adding a knob to the game can never make it invisible here.
 */
import { DEFAULTS, OVERRIDES } from './core/tuning.js';
import { CROSS } from './entities/powerorb.js';
import './entities/player.js';

/* ------------------------------- the words -------------------------------- */

const GROUPS = {
  CROSS: {
    title: 'Cross Slash',
    blurb: 'Hold attack: she plants and cuts three times, holding whoever the '
      + 'cuts catch, then throws all of them at once. The expensive move, and '
      + 'the one four adults said was too strong.',
    fields: {
      cuts: ['Cuts', 'How many times she swings. Three is the name of the move — the kanji is 十.', '', 1, 6, 1],
      gap: ['Time per cut', 'How long each cut is on screen. The whole cutting is cuts × this. Below about 0.25 you cannot see three of anything happen.', 's', 0.1, 0.6, 0.01],
      hold: ['Tap/hold line', 'How long attack must be held to mean the technique rather than an ordinary slash. She can still WALK through this. Too short and a kid who meant to slash gets the technique.', 's', 0.05, 0.6, 0.01],
      wind: ['Wind-up', 'Planted and committed, before the first cut. This is the warning everybody else gets, and the main balance knob — longer is weaker.', 's', 0, 1.2, 0.01],
      hang: ['Hang', 'The pause between the last cut and the launch. Smash’s charged bat: a big hit needs a moment of nothing before it.', 's', 0, 0.8, 0.01],
      cool: ['Recovery', 'How long after the launch she can neither attack nor block. Chimes when it ends.', 's', 0, 2, 0.05],
      knock: ['Launch force', 'The one big throw at the end, applied to everybody she caught. Not the per-cut number — that is ATTACKS.tri.', '', 5, 60, 1],
      lift: ['Launch height', 'How far up the same throw sends them.', '', 0, 30, 0.5],
      gravity: ['Air gravity', 'Fraction of gravity while she runs the technique airborne. 0 would freeze her mid-air, 1 would drop her out of her own move.', '×', 0, 1, 0.05],
    },
  },
  CHARGE: {
    title: 'Charge',
    blurb: 'Sprint into attack and she goes straight through whatever is there. '
      + 'Gravity is off for the duration, so in the air it is the whole move.',
    fields: {
      dist: ['Distance', 'How far she travels before it ends on its own.', '', 4, 40, 1],
      speed: ['Speed', 'How fast she covers it. Distance ÷ speed is how long she is committed.', '', 10, 90, 1],
      dmg: ['Damage', 'On contact. Also feeds ATTACKS.charge.', '', 1, 60, 1],
      knock: ['Knockback', 'How far it throws them.', '', 1, 60, 1],
      lift: ['Lift', 'How far up.', '', 0, 25, 0.5],
      radius: ['Reach', 'How wide the contact test is as she passes.', '', 0.5, 8, 0.1],
    },
  },
  WARD: {
    title: 'Ward (the bubble)',
    blurb: 'A block with a budget rather than a toggle. It stops blades, not the '
      + 'edge of the world — a ring-out pierces it on purpose.',
    fields: {
      max: ['Budget', 'Total seconds of bubble she gets before it must recharge.', 's', 0.3, 6, 0.1],
      tail: ['Tail', 'How long it keeps protecting after she lets go. Stops a frame-perfect release being punished.', 's', 0, 1, 0.02],
      cool: ['Recharge', 'The wait after a full drain.', 's', 0.2, 5, 0.1],
      coolMin: ['Minimum wait', 'The wait after a short tap, so tapping it is not free.', 's', 0, 2, 0.05],
      gravity: ['Air gravity', 'Fraction of gravity while blocking in the air.', '×', 0, 1, 0.05],
      radius: ['Bubble size', 'Drawn and tested at this radius.', '', 1, 6, 0.1],
      regrab: ['Double-tap grace', 'How long the second tap of a double tap has to take back the wait the first tap’s release charged. NOT the double-tap window itself (that is 340ms, in input.js) — this is the slack behind it. Latching buys her the button, never extra seconds.', 's', 0, 1.5, 0.05],
    },
  },
  DIVE: {
    title: 'Power dive',
    blurb: 'Interact, in the air, and she drops. It lands on everything under '
      + 'her — a falling body has no facing.',
    fields: {
      speed: ['Fall speed', 'How fast she comes down.', '', 15, 90, 1],
      dmg: ['Damage', 'On landing. Also feeds ATTACKS.dive.', '', 1, 60, 1],
      knock: ['Knockback', 'How far it throws them.', '', 1, 50, 1],
      lift: ['Lift', 'How far up. Higher than it looks — she is landing on them.', '', 0, 25, 0.5],
      radius: ['Blast radius', 'How far from the impact it reaches.', '', 1, 10, 0.1],
    },
  },
  COMBAT: {
    title: 'Getting hit',
    blurb: 'The numbers that are about taking a blow rather than about throwing '
      + 'one. These touch every fight in the game, so move them in small steps.',
    fields: {
      maxHp: ['Health', 'Everybody’s bar. The snacks heal fractions of this, so raising it raises them too.', '', 20, 400, 5],
      hitStun: ['Hit stun', 'How long a hit takes her controls away.', 's', 0, 1, 0.02],
      invuln: ['Invulnerability', 'How long after a hit she cannot be hit again. Shorter means combos; longer means nobody gets stuck.', 's', 0, 2, 0.05],
      daze: ['Friendly-fire daze', 'What hitting your own partner costs HER, in seconds of no control. The lockout is twice this.', 's', 0, 4, 0.1],
      rage: ['Rage cap', 'Smash’s percent rule: knockback multiplier at zero health. 1 turns it off entirely.', '×', 1, 3, 0.05],
      strikeHeight: ['Strike height', 'How far above or below you a blade still reaches. This is NOT how far a hit throws her up — that is each attack’s Lift. It was 4.5, which is a nine-metre column: you could cut somebody who had double-jumped over your head.', 'm', 0.5, 6, 0.25],
    },
  },
  ATTACKS: {
    title: 'The swings themselves',
    blurb: 'One row per kind of blow. `dive` and `charge` are copied from their '
      + 'own tables above at load, so tune those instead unless you want the '
      + 'strike to differ from the move.',
    rows: {
      stand: 'Standing slash — the ordinary one, the one two sisters know.',
      dash: 'Pounce-dash slash. Faster, further, and it should stay the best plain swing.',
      air: 'Aerial slash. Most lift of the three, because it is how you start a juggle.',
      tri: 'ONE CUT of the Cross Slash. Deliberately feeble — nine damage and a nudge — because the cuts HOLD rather than throw. All the force lives in CROSS.knock.',
      dive: 'The power dive’s strike. Mirrors DIVE.',
      charge: 'The charge’s strike. Mirrors CHARGE.',
    },
    fields: {
      dmg: ['Damage', 'Off a bar of COMBAT.maxHp.', '', 0, 60, 1],
      knock: ['Knockback', 'How far back it throws them, before rage.', '', 0, 60, 1],
      lift: ['Lift', 'How far up.', '', 0, 25, 0.5],
      reach: ['Reach', 'How far in front the hit test goes. The drawn arc grows with it.', '', 0.5, 10, 0.1],
      arc: ['Arc', 'Cosine floor on the forward test: 1 is straight ahead only, 0 is a half-circle, -1 is all round her. The dive is -1 — it lands on everything under her.', '', -1, 1, 0.05],
    },
  },
};

/* ------------------------------- the state -------------------------------- */

/** Live overrides, edited in place, POSTed whole. Starts as what is on disk. */
const edits = structuredClone(OVERRIDES ?? {});

const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The value a field has right now: the override if there is one, else shipped. */
function valueOf(group, path) {
  let e = edits[group];
  let d = DEFAULTS[group];
  for (const k of path) {
    e = isObj(e) ? e[k] : undefined;
    d = isObj(d) ? d[k] : undefined;
  }
  return typeof e === 'number' && Number.isFinite(e) ? e : d;
}

function setValue(group, path, v) {
  if (!isObj(edits[group])) edits[group] = {};
  let node = edits[group];
  for (const k of path.slice(0, -1)) {
    if (!isObj(node[k])) node[k] = {};
    node = node[k];
  }
  node[path.at(-1)] = v;
}

/** Drop an override, and any now-empty parents with it — an override set full
 *  of empty objects would write `"CROSS": {}` into a file whose whole value is
 *  that its diff is the change. */
function clearValue(group, path) {
  const prune = (node, keys) => {
    if (!isObj(node)) return;
    if (keys.length === 1) { delete node[keys[0]]; return; }
    prune(node[keys[0]], keys.slice(1));
    if (isObj(node[keys[0]]) && !Object.keys(node[keys[0]]).length) delete node[keys[0]];
  };
  prune(edits[group], path);
  if (isObj(edits[group]) && !Object.keys(edits[group]).length) delete edits[group];
}

function defaultOf(group, path) {
  let d = DEFAULTS[group];
  for (const k of path) d = isObj(d) ? d[k] : undefined;
  return d;
}

/* ------------------------------- the fields ------------------------------- */

const groupsEl = document.getElementById('groups');
const statusEl = document.getElementById('status');
const rendered = [];

function say(msg, good = true) {
  statusEl.textContent = msg;
  statusEl.style.color = good ? 'var(--gold)' : 'var(--vermillion)';
}

/**
 * One editable number: slider, box, what it was, and how to put it back.
 *
 * THE SLIDER AND THE BOX ARE BOTH AUTHORITATIVE, and the box has no range on
 * it. A slider is for finding a value and a typed number is for setting one,
 * and a page that clamps a typed 0.62 back to a slider maximum somebody picked
 * as "probably enough" is a page that cannot be used to answer "what if it
 * were much bigger". The slider range is a suggestion; the box is the truth.
 */
function field(group, path, spec) {
  const [label, help, unit, min, max, step] = spec;
  const shipped = defaultOf(group, path);
  const wrap = document.createElement('div');
  wrap.className = 'field';

  const row = document.createElement('div');
  row.className = 'frow';
  const name = document.createElement('div');
  name.className = 'fname';
  name.innerHTML = `${label}<code>${[group, ...path].join('.')}</code>`;
  row.appendChild(name);

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = min; slider.max = max; slider.step = step;
  const box = document.createElement('input');
  box.type = 'number';
  box.step = step;
  const unitEl = document.createElement('span');
  unitEl.className = 'unit';
  unitEl.textContent = unit;
  const was = document.createElement('span');
  was.className = 'was';
  const reset = document.createElement('button');
  reset.className = 'reset';
  reset.textContent = 'default';

  row.append(slider, box, unitEl, was, reset);
  wrap.appendChild(row);

  const helpEl = document.createElement('div');
  helpEl.className = 'help';
  helpEl.textContent = help;
  wrap.appendChild(helpEl);

  const paint = () => {
    const v = valueOf(group, path);
    slider.value = v;
    if (document.activeElement !== box) box.value = v;
    const changed = v !== shipped;
    wrap.classList.toggle('changed', changed);
    was.textContent = changed ? `was ${shipped}` : '';
    reset.style.display = changed ? '' : 'none';
  };

  const commit = (raw) => {
    const v = Number(raw);
    if (!Number.isFinite(v)) return;
    if (v === shipped) clearValue(group, path);
    else setValue(group, path, v);
    refresh();
  };

  slider.addEventListener('input', () => commit(slider.value));
  box.addEventListener('input', () => commit(box.value));
  reset.addEventListener('click', () => { clearValue(group, path); refresh(); });

  rendered.push(paint);
  return wrap;
}

function build() {
  for (const [group, g] of Object.entries(GROUPS)) {
    if (!DEFAULTS[group]) continue;
    const sec = document.createElement('section');
    const h = document.createElement('h2');
    h.textContent = g.title;
    const p = document.createElement('p');
    p.className = 'blurb';
    p.textContent = g.blurb;
    sec.append(h, p);

    if (g.rows) {
      /* A TABLE OF TABLES, one sub-heading per row. `ATTACKS` is the only one,
         and flattening it into thirty fields called `stand.dmg` would lose the
         one thing that makes it readable: that these are six versions of the
         same five numbers. */
      for (const [row, blurb] of Object.entries(g.rows)) {
        if (!isObj(DEFAULTS[group][row])) continue;
        const sub = document.createElement('h2');
        sub.style.fontSize = '1.05rem';
        sub.style.marginTop = '1rem';
        sub.textContent = row;
        const sb = document.createElement('p');
        sb.className = 'blurb';
        sb.textContent = blurb;
        sec.append(sub, sb);
        for (const key of Object.keys(DEFAULTS[group][row])) {
          sec.appendChild(field(group, [row, key], g.fields[key] ?? guess(key, DEFAULTS[group][row][key])));
        }
      }
    } else {
      for (const key of Object.keys(DEFAULTS[group])) {
        sec.appendChild(field(group, [key], g.fields[key] ?? guess(key, DEFAULTS[group][key])));
      }
    }
    groupsEl.appendChild(sec);
  }

  /* ANYTHING `tune()` KNOWS ABOUT AND THIS PAGE DOES NOT still gets a section.
     A knob added to the game after this file was written must not be invisible
     here — that is how a tuning page rots into a lie. */
  for (const group of Object.keys(DEFAULTS)) {
    if (GROUPS[group]) continue;
    const sec = document.createElement('section');
    sec.innerHTML = `<h2>${group}</h2><p class="blurb">No description written for this
      table yet — add one to GROUPS in src/tuning-page.js. The values below are real.</p>`;
    for (const key of Object.keys(DEFAULTS[group])) {
      if (typeof DEFAULTS[group][key] !== 'number') continue;
      sec.appendChild(field(group, [key], guess(key, DEFAULTS[group][key])));
    }
    groupsEl.appendChild(sec);
  }
}

/** A range for a field nobody has described: an order of magnitude either side
 *  of where it is now, which is wrong but never useless. */
function guess(key, v) {
  const hi = Math.max(1, Math.abs(v) * 3);
  return [key, '', '', v < 0 ? -hi : 0, hi, Math.abs(v) < 1 ? 0.01 : 1];
}

function refresh() {
  for (const paint of rendered) paint();
  drawTimeline();
  const n = countEdits(edits);
  say(n ? `${n} value${n === 1 ? '' : 's'} changed — not saved yet` : 'matching the shipped balance');
}

const countEdits = (o) => Object.values(o ?? {}).reduce(
  (n, v) => n + (isObj(v) ? countEdits(v) : 1), 0,
);

/* ------------------------- the Cross Slash, drawn ------------------------- */

const canvas = document.getElementById('viz');
const ctx = canvas.getContext('2d');
const phasesEl = document.getElementById('phases');
const totalsEl = document.getElementById('totals');

const COL = {
  tap: '#7f8ea3', wind: '#f5c341', cut: '#e0512c', hang: '#9b5de5', cool: '#3aa17e',
};

/** The move as a list of phases, from the values on the page. THE ONE PLACE
 *  the timeline is computed — the bars, the table, the playhead and the kitten
 *  all read this, so they cannot disagree about when a cut lands. */
function timeline() {
  const v = (k) => valueOf('CROSS', [k]);
  const cuts = Math.max(1, Math.round(v('cuts')));
  const out = [];
  let t = 0;
  out.push({ key: 'tap', name: 'tap window', from: 0, to: t += v('hold'), can: 'walk, jump, let go for an ordinary slash' });
  out.push({ key: 'wind', name: 'wind-up', from: t, to: t += v('wind'), can: 'nothing — planted, and letting go throws it away' });
  for (let i = 0; i < cuts; i++) {
    out.push({ key: 'cut', name: `cut ${i + 1}`, from: t, to: t += v('gap'), can: 'nothing — committed, only a hit stops it', cut: true });
  }
  out.push({ key: 'hang', name: 'hang', from: t, to: t += v('hang'), can: 'nothing — everybody caught is still frozen' });
  const launch = t;
  out.push({ key: 'cool', name: 'recovery', from: t, to: t += v('cool'), can: 'walk and jump, but not attack or block' });
  return { phases: out, cuts, launch, end: t };
}

let playT = 0;
let last = performance.now();

function drawTimeline() {
  const { phases, launch, end } = timeline();
  const W = canvas.width;
  const H = canvas.height;
  const padL = 16;
  const padR = 16;
  const barY = 34;
  const barH = 46;
  const span = W - padL - padR;
  const x = (t) => padL + (t / Math.max(0.001, end)) * span;

  ctx.clearRect(0, 0, W, H);

  /* --- the bars --- */
  ctx.font = '600 15px Nunito, sans-serif';
  ctx.textBaseline = 'middle';
  for (const p of phases) {
    const x0 = x(p.from);
    const w = Math.max(1, x(p.to) - x0);
    ctx.fillStyle = COL[p.key];
    ctx.fillRect(x0, barY, w, barH);
    ctx.strokeStyle = '#16090d';
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, barY, w, barH);
    if (w > 42) {
      ctx.fillStyle = '#1d1216';
      ctx.textAlign = 'center';
      ctx.fillText(p.name, x0 + w / 2, barY + barH / 2);
    }
  }

  /* --- the ruler, at a spacing that stays readable however long the move is --- */
  const stepT = end > 4 ? 1 : end > 2 ? 0.5 : 0.25;
  ctx.strokeStyle = '#4a3038';
  ctx.fillStyle = '#f2ddb4';
  ctx.font = '500 13px Nunito, sans-serif';
  ctx.textAlign = 'center';
  for (let t = 0; t <= end + 1e-6; t += stepT) {
    ctx.beginPath();
    ctx.moveTo(x(t), barY + barH);
    ctx.lineTo(x(t), barY + barH + 8);
    ctx.stroke();
    ctx.fillText(`${t.toFixed(2)}s`, x(t), barY + barH + 20);
  }

  /* --- the stage --- */
  const groundY = H - 44;
  ctx.strokeStyle = '#4a3038';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(padL, groundY);
  ctx.lineTo(W - padR, groundY);
  ctx.stroke();

  const phase = phases.find((p) => playT >= p.from && playT < p.to) ?? phases.at(-1);
  drawKittens(phase, playT, launch, groundY, W);

  /* --- the playhead, over everything --- */
  const px = x(Math.min(playT, end));
  ctx.strokeStyle = '#fbeed2';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px, barY - 10);
  ctx.lineTo(px, groundY);
  ctx.stroke();
  ctx.fillStyle = '#fbeed2';
  ctx.textAlign = px > W - 90 ? 'right' : 'left';
  ctx.font = '700 14px Nunito, sans-serif';
  ctx.fillText(`${playT.toFixed(2)}s — ${phase.name}`, px + (px > W - 90 ? -6 : 6), barY - 18);

  writePhases(phases, end);
}

/**
 * Ember, and the sister she is cutting.
 *
 * SCHEMATIC ON PURPOSE, AND SAYING SO. Drawing the real kitten would mean the
 * sprite pipeline — a measured atlas, blob detection, background removal — and
 * an approximation of it here would be a MEASUREMENT MADE UP, which is the
 * eighth non-negotiable exactly backwards. What this has to show is the
 * timing, and for that a stick figure whose crouch is computed from the same
 * expression the game uses is worth more than a cat that is off by a frame.
 *
 * The crouch really is the game's: `(1 - triWindT / CROSS.wind) * 0.18`, from
 * `Player._updateSprite`.
 */
function drawKittens(phase, t, launch, groundY, W) {
  const cx = W * 0.30;
  const ox = W * 0.55;
  const hgt = 132;

  /* Wind-up crouch, the game's own curve: deepest at the moment of the cut. */
  let squashY = 1;
  if (phase.key === 'wind') {
    const left = phase.to - t;
    const k = 1 - left / Math.max(0.001, phase.to - phase.from);
    squashY = 1 - k * 0.18;
  }

  const cut = phase.key === 'cut';
  const held = cut || phase.key === 'hang';
  const flying = t >= launch;

  /* --- her --- */
  ctx.save();
  ctx.strokeStyle = '#ff8a3d';
  ctx.fillStyle = '#ff8a3d';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  const bodyH = hgt * squashY;
  const headR = 21 / squashY ** 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, groundY);
  ctx.lineTo(cx, groundY - bodyH);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, groundY - bodyH - headR, headR, 0, Math.PI * 2);
  ctx.fill();
  /* Ears, because a circle on a stick is not a kitten and this is the one
     flourish that makes the figure read at a glance. */
  ctx.beginPath();
  ctx.moveTo(cx - headR * 0.8, groundY - bodyH - headR * 1.3);
  ctx.lineTo(cx - headR * 1.1, groundY - bodyH - headR * 2.4);
  ctx.lineTo(cx - headR * 0.1, groundY - bodyH - headR * 1.7);
  ctx.moveTo(cx + headR * 0.8, groundY - bodyH - headR * 1.3);
  ctx.lineTo(cx + headR * 1.1, groundY - bodyH - headR * 2.4);
  ctx.lineTo(cx + headR * 0.1, groundY - bodyH - headR * 1.7);
  ctx.fill();

  /* The blade: drawn back through the wind-up, sweeping through a cut. */
  let bladeA = -0.4;
  if (phase.key === 'wind') bladeA = -0.4 - (1 - (phase.to - t) / Math.max(0.001, phase.to - phase.from)) * 1.5;
  if (cut) {
    const k = (t - phase.from) / Math.max(0.001, phase.to - phase.from);
    bladeA = -1.9 + k * 3.2;
  }
  const bx = cx + Math.cos(bladeA) * 88;
  const by = groundY - bodyH * 0.72 + Math.sin(bladeA) * 88;
  ctx.strokeStyle = '#fbeed2';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(cx, groundY - bodyH * 0.72);
  ctx.lineTo(bx, by);
  ctx.stroke();

  /* The slash arc, only while a cut is actually out. */
  if (cut) {
    ctx.strokeStyle = '#e0512c';
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.arc(cx, groundY - bodyH * 0.72, 88, bladeA - 0.9, bladeA);
    ctx.stroke();
  }
  ctx.restore();

  /* --- her sister: held and frozen, or thrown --- */
  ctx.save();
  let sx = ox;
  let sy = groundY;
  let alpha = 1;
  if (held) {
    /* Weightless is not a detail of the hold, it IS the hold — she floats. */
    sy = groundY - 34;
  } else if (flying) {
    const f = t - launch;
    sx = ox + f * 300;
    sy = groundY - 34 - f * 260 + f * f * 300;
    alpha = Math.max(0, 1 - f * 0.55);
  }
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = '#35d7f0';
  ctx.fillStyle = '#35d7f0';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(sx, sy - 116);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(sx, sy - 136, 20, 0, Math.PI * 2);
  ctx.fill();
  if (held) {
    /* The hit-stop flash, and it PULSES — one per cut, decaying over 0.22s,
       which is `flashT` in `Player.triCapture`. A constant glow was the first
       attempt and it said the wrong thing: three flashes on a body that is not
       moving is what tells a kid the freeze is the move and not the game
       hanging, and a steady one says only "this cat is highlighted". */
    const since = phase.key === 'cut' ? t - phase.from : 1;
    const flash = Math.max(0, 1 - since / 0.22);
    if (flash > 0) {
      ctx.globalAlpha = alpha * flash * 0.45;
      ctx.fillStyle = '#fbeed2';
      ctx.beginPath();
      ctx.arc(sx, sy - 72, 44 + flash * 22, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  if (held) {
    ctx.fillStyle = '#f2ddb4';
    ctx.font = '600 17px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('held — damage banking, not paid yet', ox, groundY + 26);
  } else if (flying && t < launch + 0.6) {
    ctx.fillStyle = '#f5c341';
    ctx.font = '700 18px Nunito, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LAUNCH — everything at once', ox, groundY + 26);
  }
}

function writePhases(phases, end) {
  phasesEl.innerHTML = '';
  for (const p of phases) {
    const tr = document.createElement('tr');
    tr.innerHTML = `<td><span style="color:${COL[p.key]}">■</span> ${p.name}</td>`
      + `<td class="n">${p.from.toFixed(2)}</td><td class="n">${p.to.toFixed(2)}</td>`
      + `<td>${p.can}</td>`;
    phasesEl.appendChild(tr);
  }
  const planted = phases.filter((p) => p.key === 'wind' || p.key === 'cut' || p.key === 'hang')
    .reduce((s, p) => s + (p.to - p.from), 0);
  const perCut = valueOf('ATTACKS', ['tri', 'dmg']);
  const cuts = Math.max(1, Math.round(valueOf('CROSS', ['cuts'])));
  totalsEl.innerHTML = `<b>Press to swinging again: ${end.toFixed(2)}s.</b> `
    + `Planted and unable to act: ${planted.toFixed(2)}s. `
    + `All three landing is ${cuts * perCut} damage plus a ${valueOf('CROSS', ['knock'])}-force throw, `
    + `against ${valueOf('ATTACKS', ['stand', 'dmg'])} for an ordinary slash.`;
}

/* The loop runs whether or not anything is moving: the playhead is the point,
   and a page that only animated on change would need a change to show you what
   the change did. */
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const { end } = timeline();
  playT += dt;
  /* LOOPS AT THE END OF THE MOVE AND NOT A MOMENT LATER. It ran on for another
     0.9s at first so the launched sister had time to leave the frame, and the
     readout then said "2.72s" over a timeline that stops at 2.40 — a page
     about timing reporting a time that is not on it. The recovery is 0.75s of
     flight, which is plenty to see her go. */
  if (playT > end) playT = 0;
  drawTimeline();
  requestAnimationFrame(frame);
}

/* --------------------------------- saving --------------------------------- */

document.getElementById('save').addEventListener('click', async () => {
  try {
    const r = await fetch('/__tuning', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(edits),
    });
    if (!r.ok) throw new Error(await r.text());
    const { saved } = await r.json();
    say(`saved — ${countEdits(saved)} override(s) in src/tuning.json`);
  } catch (e) {
    /* THE FAILURE THAT ACTUALLY HAPPENS is opening this page off a built copy,
       where /__tuning does not exist because `configureServer` never ran. Say
       which of the two it is rather than printing a status code. */
    say(`could not save (${e.message}). Is this npm run dev?`, false);
  }
});

document.getElementById('revert').addEventListener('click', () => {
  for (const k of Object.keys(edits)) delete edits[k];
  refresh();
  say('back to the shipped balance — press save to write it');
});

build();
refresh();
requestAnimationFrame(frame);

/* Keeps the units honest in the one place a reader might reasonably wonder:
   CROSS is imported so this file fails loudly if the module stops exporting
   it, rather than silently showing an empty Cross Slash section. */
if (!CROSS || typeof CROSS.gap !== 'number') say('powerorb.js is not exporting CROSS', false);
