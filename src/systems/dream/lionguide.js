import { ISLANDS, ISLE_ABOUT } from './islands.js';
import { featuredPool, picksFor } from './rank.js';
import { SHADOW_LEVELS, inherited } from './shadow.js';

/* ---------------------------------------------------------------------------
   LIONHEART, THE SIMULATOR'S QUEST-GIVER.

   Richard: "Lionheart should act as a Quest giver like how Payne is a quest
   giver, to keep track of where the player has visited and what they have
   achieved, so that the player knows where they should go next or what they
   should do. Lionheart can give them suggestions of what to do next incase
   they are lost." And: "There should be a minimap of some sort in the
   simulator, could just be a kiosk or map legend the player can view in the
   main island".

   HIS CARD IS PAYNE'S CARD. Same host (`Inspector`, `#pane-cards`), same pane,
   same three buttons, same way out on the card — everything that card has
   learned about a phone, a stuck stick and a press acted on twice, his gets
   for free. This file is what he SAYS and what his rows DO, with the same
   five methods hers has (`rows`, `choose`, `markup`, `rowCount`, `greet`);
   the Inspector only drives the cursor.

   WHAT HE KNOWS IS WHAT THE SIMULATOR ALREADY RECORDS. Stars are the
   progress store's (`DreamProgress`, by her drawing's name, the key the rank
   uses); a visit is one more flag in the same row (`visit.<island>`, set by
   `DreamDojo._noteVisits` when she stands on an island). So "where she has
   been" outlives the tab exactly as her stars do, and is wiped by the same
   debug row. The Shadow's levels are `p.shadowBeat`, a fact about this game.

   WHAT TO DO NEXT IS ONE PURE FUNCTION, `lionNext`, the way Payne's is
   `nextStep`: the card, his "lost?" line and world-check all ask it, so the
   three cannot disagree. Its order is the order an afternoon goes in — see
   every island, win a star on each, take on his Shadow, then chase three
   stars, then the 凶 — and it always has an answer, the last one being "come
   back tomorrow", because a quest-giver with nothing to say reads as broken.

   NO NEW RECORDINGS. Everything here names an island and a number, and a
   recording can only say one of each (the same reason `send` and `rundown`
   are text). He speaks in his bubble and his caption, as every line did
   before he had a voice.
--------------------------------------------------------------------------- */

/** The islands in the order he suggests them: round from the port, near ones
 *  first, then the highways, then his Shadow — the order they are met in. */
export const GUIDE_ORDER = ['gallery', 'hall', 'range', 'kata', 'storm', 'sine', 'school', 'sentries', 'bamboo', 'shadow'];

/** His states on the shared card. The root, and what its rows open. */
export const LION_STATES = ['lion', 'lionQuests', 'lionMap', 'lionKyo'];

/** Which root row each sub-card came from, so BACK lands on it. */
export const LION_FROM = { lionQuests: 'next', lionMap: 'map', lionKyo: 'kyo' };

/** His face on his drawing, `[x, y, size]` on the 768px file — MEASURED, cut
 *  out and looked at, as Payne's is (`PAYNE_ART`). */
export const LION_FACE = { src: '/sprites/lionheart/town.png', face: [238, 20, 230] };

/** Seconds of nothing won before he calls a kitten over, and how often after. */
export const LOST_AFTER = 150;
export const LOST_AGAIN = 240;
export const LOST_MAX = 3;

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

const ORD = ['first', 'second', 'third', 'fourth', 'fifth'];

/** The drills an island holds, by id — the training-of-the-day's own list,
 *  so an island that gains a drill gains it here too. */
export function drillsOf(key) {
  const name = ISLANDS[key]?.name;
  return featuredPool().filter((d) => d.isle === name).map((d) => d.id);
}

/**
 * The way there, in words, from where she came in. "Left" and "right" are as
 * she walks off the port bridge onto the hub, which is the side his own
 * `islands` line has always named them on.
 */
export function wayTo(key) {
  const spec = ISLANDS[key];
  if (!spec) return '';
  if (spec.from) return `past the ${ISLANDS[spec.from].name} — ride the highway off its far side`;
  if (Math.abs(spec.ang) >= 179) return 'straight across the Dojo from where you came in';
  const left = spec.ang > 0;
  const same = Object.values(ISLANDS)
    .filter((s) => !s.from && Math.abs(s.ang) < 179 && (s.ang > 0) === left)
    .map((s) => Math.abs(s.ang)).sort((a, b) => a - b);
  const n = same.indexOf(Math.abs(spec.ang));
  return `the ${ORD[n] ?? `number ${n + 1}`} bridge on your ${left ? 'LEFT' : 'RIGHT'} as you come in`
    + (spec.cycle ? ' — a light-cycle highway' : '');
}

/** Every star she holds, by id, without making her a row. */
function starsOf(progress, name) {
  return progress?.data?.kittens?.[name]?.stars ?? {};
}

/**
 * What she has done on one island. Pure on the store, her name and her.
 * `max` is null on the kata floor: any song, three levels, and charts the
 * kittens write themselves — there is no "all of it" to have done.
 */
export function isleReport(progress, name, key, p = null) {
  const spec = ISLANDS[key];
  const visited = !!progress?.flag?.(name, `visit.${key}`);
  const all = starsOf(progress, name);
  let got = 0;
  let max = 0;
  let tried = 0;
  let total = 0;
  if (key === 'kata') {
    for (const [id, s] of Object.entries(all)) if (id.startsWith('kata.') && s > 0) { got += s; tried++; }
    max = null;
  } else if (key === 'shadow') {
    const b = p?.shadowBeat ?? {};
    total = SHADOW_LEVELS.length;
    tried = SHADOW_LEVELS.filter((L) => b[L.id]).length;
    got = tried;
    max = total;
  } else {
    const ids = drillsOf(key);
    total = ids.length;
    for (const id of ids) {
      const s = all[id] ?? 0;
      got += s;
      if (s > 0) tried++;
    }
    max = ids.length * 3;
  }
  return {
    key, name: spec.name, short: ISLE_ABOUT[key]?.short ?? spec.name, kanji: spec.kanji,
    visited, got, max, tried, total, done: max != null && max > 0 && got >= max,
  };
}

/**
 * WHAT SHE SHOULD DO NEXT — one suggestion, always. Returns
 * `{ kind, key, text, short }`: `text` is the card's sentence and `short` is
 * what he calls out to a kitten who looks lost.
 */
export function lionNext(progress, name, p = null) {
  const reps = GUIDE_ORDER.map((k) => isleReport(progress, name, k, p));
  const fresh = reps.find((r) => !r.visited);
  if (fresh) {
    return {
      kind: 'visit', key: fresh.key,
      text: `You haven't been to the ${fresh.name} yet! It's ${wayTo(fresh.key)}. ${ISLE_ABOUT[fresh.key].about}`,
      short: `Try the ${fresh.name} — it's ${wayTo(fresh.key)}.`,
    };
  }
  const untried = reps.find((r) => r.key !== 'shadow' && r.tried === 0);
  if (untried) {
    return {
      kind: 'try', key: untried.key,
      text: `You've seen the ${untried.name}, but you haven't won a star there yet. Go back and give it a go — it's ${wayTo(untried.key)}.`,
      short: `No stars at the ${untried.name} yet — give it a go!`,
    };
  }
  const b = p?.shadowBeat ?? {};
  if (!(b.medium || b.hard)) {
    return {
      kind: 'shadow', key: 'shadow',
      text: `Ready for my SHADOW? Beat him on MEDIUM and a special Kotodama is yours. He's ${wayTo('shadow')}.`,
      short: 'Ready for my SHADOW? Beat him on MEDIUM!',
    };
  }
  const chase = reps
    .filter((r) => r.max && r.key !== 'shadow' && !r.done)
    .sort((x, y) => x.got / x.max - y.got / y.max)[0];
  if (chase) {
    return {
      kind: 'stars', key: chase.key,
      text: `Go for three stars at the ${chase.name}: you have ${chase.got} of ${chase.max}. It's ${wayTo(chase.key)}.`,
      short: `Three stars at the ${chase.name}: ${chase.got} of ${chase.max}!`,
    };
  }
  if (!inherited(p)) {
    const left = SHADOW_LEVELS.filter((L) => !b[L.id]).map((L) => L.name).join(' and ');
    return {
      kind: 'kyo', key: 'shadow',
      text: `Beat my Shadow on ${left} too, and my 凶 CROSS SLASH is yours.`,
      short: `Beat my Shadow on ${left} — and take my 凶!`,
    };
  }
  return {
    kind: 'daily', key: 'kata',
    text: "You've done it ALL. Now dance my kata to every song — and write me a routine of your own at the beat-map kiosk.",
    short: "You've done it all! Dance my kata to another song.",
  };
}

/* ------------------------------- the card -------------------------------- */

function loadImage(src) {
  if (typeof Image === 'undefined') return null;
  const img = new Image();
  img.src = src;
  return img;
}

export class LionGuide {
  constructor(dream) {
    this.dream = dream;
    this.game = dream.game;
    /** Per seat: what he last said to her on the card, and when. */
    this.said = [];
    this.img = null;
  }

  _name(p) { return p.style?.name ?? p.name; }

  report(p) {
    return GUIDE_ORDER.map((k) => isleReport(this.dream.progress, this._name(p), k, p));
  }

  next(p) { return lionNext(this.dream.progress, this._name(p), p); }

  /** Say it on her card, and in his bubble (captioned for a kitten far off). */
  _say(p, text, aloud = true) {
    this.said[p.index] = { text, t: this.dream.t ?? 0 };
    if (aloud) this.dream.holoSay?.(text.replace(/ — /g, '\n'), 6);
  }

  speaking(p) {
    const s = this.said[p.index];
    return s && (this.dream.t ?? 0) - s.t < 14 ? s.text : null;
  }

  greet(p) {
    const n = this.next(p);
    this._say(p, `${p.name}! ${n.short}`, false);
  }

  leave(p) { this.said[p.index] = null; }

  /** The repaint signature: anything that changes a word on the card. */
  sig(p) {
    const r = this.report(p).map((x) => `${x.visited ? 1 : 0}${x.got}`).join(',');
    const s = this.dream.st[p.index];
    const at = this.dream._flatPos?.(p);
    return [this.speaking(p) ?? '', r, (s?.holoWorn ?? []).length, inherited(p),
      at ? `${Math.round(at.x / 4)},${Math.round(at.z / 4)}` : ''].join('|');
  }

  rows(p) {
    const s = this.dream.st[p.index];
    const worn = (s?.holoWorn ?? []).length;
    const b = p.shadowBeat ?? {};
    const kyo = inherited(p);
    const levels = SHADOW_LEVELS.map((L) => `${L.name} ${b[L.id] ? '✔' : '·'}`).join('  ');
    return [
      { key: 'next', title: 'WHERE SHOULD I GO NEXT?', blurb: 'Where you have been, what you have won, and what to try next.' },
      { key: 'map', title: 'MAP OF THE SIMULATOR', blurb: 'Every island, its name, and where you are.' },
      {
        key: 'orbs', title: 'WHAT DO MY ORBS DO?',
        blurb: worn ? `A rundown of the ${worn} Kotodama you are wearing in here.`
          : "You aren't wearing any in here — win a Gallery trial to earn one.",
        locked: !worn,
      },
      { key: 'holo', title: '(HOLO) PLAYER PROFILE', blurb: 'Wear and stow the orbs you have in here. Everybody stops and gets their own cursor.' },
      /* THE GUIDE POINTS AT THE HELP PAGE. Richard: "can just have any guide
         in there point to the Help page, can just be a link just to that page
         with all the information." The Inspector does the hand-over, like the
         holo profile: it pauses the game, which is what Help is a page of. */
      { key: 'help', title: 'READ ABOUT THE DREAM DOJO', blurb: 'The Help page: every island, what it teaches, and the map. The game pauses.' },
      {
        /* LIKE PAYNE'S GOBLIN SWEEP ROW. Richard: "If player has unlocked this
           special cross-slash ability, we can show it in the dialog with
           Lionheart, like we do with the trip ability with the dialog of
           Payne." Locked, it says what it wants, level by level. */
        key: 'kyo', title: kyo ? '凶 MY CROSS SLASH — SHOW ME AGAIN' : '凶 MY CROSS SLASH — LOCKED',
        blurb: kyo ? 'How it works, now it is yours.' : `Beat my Shadow on all three levels: ${levels}`,
        locked: !kyo,
      },
    ];
  }

  /** A row was chosen. Returns the card state to go to, or null to close.
   *  `holo` is the Inspector's, which owns the hand-over to the profile. */
  choose(p, key) {
    const g = this.game;
    switch (key) {
      case 'next': {
        this._say(p, this.next(p).text, false);
        this.dream.holoSay?.(`${p.name} — ${this.next(p).short}`, 6);
        return 'lionQuests';
      }
      case 'map':
        return 'lionMap';
      case 'orbs': {
        if (!(this.dream.st[p.index]?.holoWorn ?? []).length) {
          g.sfx?.('deny');
          g.toast?.("Not yet! You aren't wearing any Kotodama in here — win a Gallery trial to earn one", p.index);
          return 'lion';
        }
        this.dream._openRundown?.(p);
        return null;
      }
      case 'kyo': {
        if (inherited(p)) return 'lionKyo';
        const r = this.rows(p).find((x) => x.key === 'kyo');
        g.sfx?.('deny');
        g.toast?.(`Not yet! ${r.blurb}`, p.index);
        this._say(p, 'Not yet, little warrior. Beat my Shadow on every level, and it is yours.', false);
        return 'lion';
      }
      case 'bye':
      default:
        this._say(p, 'Train well!', false);
        return null;
    }
  }

  rowCount(p, state) {
    if (state === 'lionQuests') return 2;
    if (state === 'lionMap') return 1;
    if (state === 'lionKyo') return 0;
    return this.rows(p).length;
  }

  /** A sub-card's row, as an action key. */
  subAct(state, row) {
    if (state === 'lionQuests') return row === 0 ? 'map' : 'back';
    return 'back';
  }

  drawFace(cv) {
    const g2 = cv?.getContext?.('2d');
    if (!g2) return;
    this.img ??= loadImage(LION_FACE.src);
    const img = this.img;
    const paint = () => {
      g2.clearRect(0, 0, cv.width, cv.height);
      const [x, y, s] = LION_FACE.face;
      g2.drawImage(img, x, y, s, s, 0, 0, cv.width, cv.height);
    };
    if (img?.complete && img.naturalWidth) paint();
    else img?.addEventListener?.('load', paint, { once: true });
  }

  /**
   * THE MAP — the simulator from above, drawn from where the islands ARE
   * (`DreamDojo.isles`), not from a picture of them: an island that moves
   * moves on here. Oriented as the corner minimap is (map x is world x, map
   * down is world +z), so the two maps of the game never disagree about
   * which way is which. Her own island's name in gold, the one he suggests
   * ringed, and a dot where she stands.
   */
  mapSvg(p, { next = null, w = 520 } = {}) {
    const D = this.dream;
    const isles = D.isles ?? {};
    const dc = D.game.world?.dojoCentre ?? { x: 0, z: 0 };
    const port = D.sim?.portDeck ?? null;
    const reps = Object.fromEntries(this.report(p).map((r) => [r.key, r]));
    const pts = [{ x: dc.x, z: dc.z, r: 50 }, ...Object.values(isles)];
    if (port) pts.push(port);
    const pad = 46;
    const minX = Math.min(...pts.map((q) => q.x - q.r)) - pad;
    const maxX = Math.max(...pts.map((q) => q.x + q.r)) + pad;
    const minZ = Math.min(...pts.map((q) => q.z - q.r)) - pad;
    const maxZ = Math.max(...pts.map((q) => q.z + q.r)) + pad;
    const vw = maxX - minX;
    const vh = maxZ - minZ;
    // A label's size, as a fraction of the map. /30 was tried first and read
    // at about 8px on a 1280-wide window, under the card's own text.
    const f = Math.max(vw, vh) / 24;
    const roads = [];
    for (const [key, I] of Object.entries(isles)) {
      const from = ISLANDS[key]?.from ? isles[ISLANDS[key].from] : { x: dc.x, z: dc.z };
      if (!from) continue;
      roads.push(`<line x1="${from.x}" y1="${from.z}" x2="${I.x}" y2="${I.z}" class="${ISLANDS[key].cycle ? 'ln-hw' : 'ln-br'}"/>`);
    }
    if (port) roads.push(`<line x1="${dc.x}" y1="${dc.z}" x2="${port.x}" y2="${port.z}" class="ln-br"/>`);
    const discs = Object.entries(isles).map(([key, I]) => {
      const r = reps[key];
      const cls = ['ln-isle', r?.visited ? 'seen' : '', next === key ? 'next' : ''].filter(Boolean).join(' ');
      const out = Math.hypot(I.x - dc.x, I.z - dc.z) || 1;
      const lx = I.x + ((I.x - dc.x) / out) * (I.r + f * 1.1);
      const lz = I.z + ((I.z - dc.z) / out) * (I.r + f * 1.1) + f * 0.35;
      const stars = r?.max ? ` ${r.got}/${r.max}★` : r?.got ? ` ${r.got}★` : '';
      return `<circle cx="${I.x}" cy="${I.z}" r="${I.r}" class="${cls}"/>`
        + (next === key ? `<circle cx="${I.x}" cy="${I.z}" r="${I.r + f * 0.5}" class="ln-ring"/>` : '')
        + `<text x="${lx}" y="${lz}" font-size="${f}" class="ln-lbl${next === key ? ' next' : ''}">${esc(r?.short ?? key)}`
        + `<tspan class="ln-st" font-size="${f * 0.8}">${stars}</tspan></text>`;
    }).join('');
    const hub = `<circle cx="${dc.x}" cy="${dc.z}" r="50" class="ln-hub"/>`
      + `<text x="${dc.x}" y="${dc.z + f * 0.35}" font-size="${f * 0.85}" class="ln-lbl hub">DOJO</text>`;
    /* The tubes' name OUTBOARD of the pad, away from the hub, like every
       island's: under it, it sat on her own YOU while she stood in her tube. */
    let pd = '';
    if (port) {
      const po = Math.hypot(port.x - dc.x, port.z - dc.z) || 1;
      const tx = port.x + ((port.x - dc.x) / po) * (port.r + f * 2.2);
      const tz = port.z + ((port.z - dc.z) / po) * (port.r + f * 2.2) + f * 0.3;
      pd = `<circle cx="${port.x}" cy="${port.z}" r="${port.r}" class="ln-port"/>`
        + `<text x="${tx}" y="${tz}" font-size="${f * 0.8}" class="ln-lbl hub">YOUR TUBES</text>`;
    }
    const at = D._flatPos?.(p);
    const me = at && Number.isFinite(at.x)
      ? `<circle cx="${at.x}" cy="${at.z}" r="${f * 0.55}" class="ln-me"/>`
        + `<text x="${at.x}" y="${at.z - f * 0.9}" font-size="${f * 0.8}" class="ln-lbl me">YOU</text>` : '';
    return `<svg class="ln-map" viewBox="${minX} ${minZ} ${vw} ${vh}" width="${w}" preserveAspectRatio="xMidYMid meet">`
      + `${roads.join('')}${hub}${pd}${discs}${me}</svg>`;
  }

  /** The card's markup. `state` is the Inspector's card state. */
  markup(index, state, cursor, backButton) {
    const p = this.game.players[index];
    if (!p) return '';
    const talk = this.speaking(p);
    const said = talk ? `<div class="pn-said">“${esc(talk)}”</div>` : '';
    const head = `<div class="pc-head pn-head">`
      + '<canvas class="pn-face ln-face" width="160" height="160"></canvas>'
      + `<div><span class="pn-name ln-name">LIONHEART</span>
      <span class="pc-dim">holo-sensei · talking to <span class="pc-who">${esc(p.name)}</span></span>
      ${said}</div></div>`;
    const act = (t, k) => `<div class="pc-row pn-act${k === cursor ? ' cursor' : ''}" data-side="${index}" data-row="${k}"><b>${t}</b></div>`;

    if (state === 'lionQuests') {
      const n = this.next(p);
      const li = (r) => {
        const mark = r.done ? '✔' : r.key === n.key ? '▶' : r.visited ? '·' : '?';
        const cls = r.done ? 'done' : r.key === n.key ? 'now' : r.visited ? 'open' : 'closed';
        const what = r.key === 'shadow' ? `${r.got} of 3 levels`
          : r.max == null ? (r.got ? `${r.got}★ in katas` : 'no kata yet')
            : `${r.got} of ${r.max}★`;
        const where = r.visited ? what : 'not been yet';
        return `<li class="pn-q ${cls}"><i>${mark}</i>${esc(r.kanji)} <b>${esc(r.name)}</b>`
          + ` <span class="pc-dim">${esc(where)}</span></li>`;
      };
      const reps = this.report(p);
      const seen = reps.filter((r) => r.visited).length;
      let today = '';
      try {
        const pk = picksFor();
        today = `<div class="pn-tag">TODAY'S TRAINING — ${esc(pk.daily.title)}, at the ${esc(pk.daily.isle)}</div>`;
      } catch { /* no date, no pick: the card stands without it */ }
      return `<div class="pc-inner pn-card ln-card">${head}
        <div class="pn-next"><b>NEXT:</b> ${esc(n.text)}</div>
        <div class="pn-tag">THE ISLANDS — ${seen} of ${reps.length} visited</div>
        <ol class="pn-list">${reps.map(li).join('')}</ol>
        ${today}
        <div class="pn-acts">${['SHOW ME ON THE MAP', '◀ BACK'].map(act).join('')}</div>
        <div class="pc-foot">${backButton(index, 'BACK')}<span>JUMP <b>choose</b> · INTERACT <b>back</b></span></div>
      </div>`;
    }

    if (state === 'lionMap') {
      const n = this.next(p);
      return `<div class="pc-inner pn-card ln-card">${head}
        <div class="ln-map-box">${this.mapSvg(p, { next: n.key })}</div>
        <div class="pn-next"><b>NEXT:</b> the ${esc(ISLANDS[n.key]?.name ?? '')} — ringed in gold.
          <span class="pc-dim">Every island's name is on a sign at its bridge, too.</span></div>
        <div class="pn-acts">${act('◀ BACK', 0)}</div>
        <div class="pc-foot">${backButton(index, 'BACK')}<span>INTERACT <b>back</b></span></div>
      </div>`;
    }

    if (state === 'lionKyo') {
      return `<div class="pc-inner pn-card ln-card">${head}
        <div class="pn-trick ln-kyo"><i class="ln-kyo-mark">凶</i>
          <div><b class="pn-trick-name">LIONHEART'S CROSS SLASH</b>
          <p>Your Cross Slash is the same move on the same buttons — but it strikes with <b>凶</b> instead of 十,
          and it lands <b>1.25×</b> as hard.</p>
          <p class="pc-dim">You beat my Shadow on all three levels, so my honor is in your strike. In the arena and out of it.</p></div>
        </div>
        <div class="pc-foot">${backButton(index, 'BACK')}<span>INTERACT <b>back</b></span></div>
      </div>`;
    }

    const rows = this.rows(p).map((r, k) => `
      <div class="pc-row${k === cursor ? ' cursor' : ''}${r.locked ? ' locked' : ''}" data-side="${index}" data-row="${k}">
        <b>${r.title}</b>
        <div class="pc-dim">${esc(r.blurb)}</div>
      </div>`).join('');
    return `<div class="pc-inner pn-card ln-card">${head}
      ${rows}
      <div class="pc-foot">${backButton(index, 'BYE, LIONHEART')}<span>JUMP <b>choose</b> · INTERACT <b>bye</b></span></div>
    </div>`;
  }
}
