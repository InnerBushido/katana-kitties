import { SITE_BY_ID } from './catalog.js';
import {
  ELEMENTS, ELEMENT_BY_ID, LAIR, LEVEL_XP, ADULT_LEVEL, levelOf, levelProgress, stageOf, hatchLeft, warmWhy,
  feedWhy, playWhy, evolveWhy, isHungry, nameIdeas, tintOf, tintCount, moodOf, voiceOf, dragonName,
} from './lair.js';

/* ---------------------------------------------------------------------------
   THE DRAGON'S LAIR CARDS — mixed into HousingCards (cards.js), so they are
   drawn in HER pane, driven by HER pad, and are a stack of views like every
   other card there: JUMP picks a row, INTERACT pops a view.

   THE ROWS DO NOT MOVE. Time changes what this card says — the egg counts
   down, she gets hungry, the tag game cools off — and a row that appears or
   vanishes on a timer slides another one under the cursor after she aimed at
   it (gotchas.md, "UI FALL-THROUGH", found five times in five places). So
   every row is always there and is greyed with its reason instead: HATCH
   sits above WARM from the moment the egg is laid, and the one that is not
   ready yet says why on its face. The one row that can come and go, STOP
   PLAYING, is LAST, so losing it moves nothing.

   CONFIRMATIONS (non-negotiable 7): buying the egg spends points and growing
   her up cannot be undone, so both are two-row views that open on NO.
   Hatching and naming are not: nothing is lost by them, and she can rename
   her dragon any time from CUSTOMIZE.
--------------------------------------------------------------------------- */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pts = (n) => `${Math.round(n).toLocaleString()} pts`;
const possessive = (names) => `${[].concat(names).join(' & ').toUpperCase()}'S`;
const hex = (c) => `#${(c >>> 0).toString(16).padStart(6, '0')}`;
/** 14:05 — the egg's wait, the way a kitchen timer says it. */
const clock = (ms) => {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const LAIR_VIEWS = {
  /** THE LAIR: her dragon, or her egg, or the egg she can buy — and who else lives here. */
  _v_lair(index, p, top) {
    const L = this.H.lair;
    const H = this._home(top);
    if (!H) return { head: "THE DRAGON'S LAIR", rows: [] };
    const me = p.style?.name;
    const own = H.owners.includes(me);
    const D = L.dragonOf(p);
    const lives = D ? L.lairFor(me) : null;
    const here = !!lives && lives.H === H;
    const now = Date.now();
    const rows = [];
    const notes = [];
    const push = (v, extra = {}) => () => { this._push(index, { v, site: top.site, cursor: 0, ...extra }); return null; };
    if (!D) {
      const price = L.eggPrice();
      notes.push(own
        ? 'No dragon yet! Buy an egg and it goes in the nest — it hatches into YOUR dragon, and she lives here.'
        : `This is ${esc(possessive(H.owners))} lair.`);
      rows.push(own
        ? {
          title: 'BUY A DRAGON EGG', right: pts(price), blurb: 'Fire, green mist, spirit flame or crystal. One dragon each.',
          disabled: p.score < price, why: `You need ${pts(price - p.score)} more for an egg.`, go: push('lairegg'),
        }
        : { title: 'BUY A DRAGON EGG', disabled: true, why: "Build a DRAGON'S LAIR in your own yard to raise a dragon there." });
    } else if (!here) {
      const site = SITE_BY_ID[lives?.H?.site]?.name;
      notes.push(lives
        ? `${esc(dragonName(D).toUpperCase())} lives at your lair on ${esc(site ?? 'your island')} — visit her there!`
        : `${esc(dragonName(D).toUpperCase())} is waiting for a lair of yours to live in.`);
    } else if (D.egg) {
      const E = ELEMENT_BY_ID[D.el] ?? ELEMENTS[0];
      const left = hatchLeft(D.egg, now);
      notes.push(left > 0
        ? `Your <b>${esc(E.name)}</b> egg is warm in the nest. It hatches in <b>${clock(left)}</b>.`
        : `Your <b>${esc(E.name)}</b> egg is RATTLING — it is ready to hatch!`);
      rows.push({
        title: 'HATCH THE EGG!', blurb: 'Crack! Then give your baby dragon a name.',
        disabled: left > 0, why: `Not yet — ${clock(left)} to go. WARM it to hurry it up!`,
        go: () => {
          if (L.hatch(p)) this._push(index, { v: 'lairname', site: top.site, cursor: 0 });
          return null;
        },
      });
      const ww = warmWhy(D.egg, now);
      rows.push({
        title: 'WARM THE EGG', blurb: `A cuddle takes ${Math.round(LAIR.warm / 60000)} minute off the wait.`,
        disabled: !!ww, why: ww, go: () => { L.warm(p); return null; },
      });
    } else {
      const E = ELEMENT_BY_ID[D.el] ?? ELEMENTS[0];
      const lvl = levelOf(D.xp);
      const hungry = isHungry(D, now);
      const nextXp = lvl >= ADULT_LEVEL ? null : LEVEL_XP[lvl + 1];
      notes.push(`<span class="hs-swatch" style="background:${hex(tintOf(D))}"></span> <b>${esc(dragonName(D).toUpperCase())}</b>`
        + ` · ${D.rare ? 'SHINY ' : ''}${esc(E.name)} ${esc(stageOf(D).name)} · LEVEL ${lvl}`
        + `<span class="hs-xp"><i style="width:${Math.round(levelProgress(D.xp) * 100)}%"></i></span>`
        + `${nextXp ? `${D.xp ?? 0} / ${nextXp} XP` : 'TOP LEVEL'} · `
        + (hungry ? '<span class="hs-bad">HUNGRY! She cannot grow until she eats.</span>' : '<span class="hs-good">Happy and full.</span>')
        + ` · ${esc(moodOf(D).name)}`);
      const fw = feedWhy(D, now);
      rows.push({
        title: `FEED HER ${E.food}`, right: `+${LAIR.feedXp} XP`,
        blurb: hungry ? 'She is HUNGRY — feeding her is the only thing that helps!' : 'One good meal an hour. Twelve hours without one and she is hungry.',
        disabled: !!fw, why: fw, go: () => { L.feed(p); return null; },
      });
      const pw = playWhy(D, now);
      rows.push({
        title: 'PLAY TAG', right: `+${LAIR.playXp} XP`, blurb: `Run and touch her ${LAIR.playTags} times before she gets tired.`,
        disabled: !!pw, why: pw, go: () => { if (L.start(p, 'tag')) this.game.inspector.closeOne(index); return null; },
      });
      rows.push({
        title: 'GO FOR A WALK', right: `+${LAIR.walkMax} XP`, blurb: 'She flies along behind you round your island.',
        go: () => { if (L.start(p, 'walk')) this.game.inspector.closeOne(index); return null; },
      });
      rows.push({
        title: D.name ? `HER NAME: ${D.name}` : 'GIVE HER A NAME', blurb: D.name ? 'Pick a new one any time.' : 'She has not got one yet!',
        go: push('lairname'),
      });
      rows.push({ title: 'CUSTOMIZE', blurb: 'Her colour, her voice and who she is.', go: push('laircustom') });
      if (D.adult) {
        rows.push({ title: 'RIDE HER IN THE ARENA', disabled: true, why: 'Coming in the next update — and Mr. Satan has a LOT to say about it.' });
      } else {
        const ew = evolveWhy(D);
        rows.push({
          title: 'GROW UP!', blurb: `At level ${ADULT_LEVEL} she can grow into a GROWN DRAGON.`,
          disabled: !!ew, why: ew, go: push('lairevolve'),
        });
      }
      rows.push({ title: 'DODGE HER FIRE · TEA · THE ONSEN', disabled: true, why: 'Coming soon! Dodging her fire will need the DRAGON BREATH oath.' });
      if (L.playing(index)) rows.push({ title: 'STOP PLAYING', blurb: 'She flies back to the lair.', go: () => { L.stop(index, null); return null; } });
    }
    // her sisters' dragons, if any live here too — a hello costs nothing and moves nothing
    for (const [n, R] of Object.entries(L.dragons())) {
      if (n === me || L.lairFor(n)?.H !== H) continue;
      if (R.egg) { notes.push(`${esc(possessive(n))} egg is in the nest too.`); continue; }
      rows.push({
        title: `SAY HELLO TO ${dragonName(R).toUpperCase()}`, right: possessive(n),
        go: () => { L.chirp(R, 3); this.game.toast(`${dragonName(R).toUpperCase()} ${moodOf(R).hello}.`, index); return null; },
      });
    }
    return {
      head: "THE DRAGON'S LAIR",
      body: notes.length ? `<div class="hs-note hs-lair">${notes.join('<br>')}</div>` : '',
      rows,
    };
  },

  /** What changes on this card with time alone, for `sig` — so the countdown counts. */
  _sig_lair(index) {
    const D = this.H.lair.dragonOf(this.game.players[index]);
    if (!D) return '';
    const now = Date.now();
    if (D.egg) return `e${Math.ceil(hatchLeft(D.egg, now) / 1000)}|${warmWhy(D.egg, now) ?? ''}`;
    return `d${feedWhy(D, now) ?? ''}|${playWhy(D, now) ?? ''}|${isHungry(D, now)}|${this.H.lair.playing(index) ? 1 : 0}`;
  },

  /** WHICH EGG: one row a kind. */
  _v_lairegg(index, p, top) {
    const price = this.H.lair.eggPrice();
    return {
      head: 'WHICH EGG?',
      body: '<div class="hs-note">Each kind hatches by its own corner of the lair. One egg in eight hatches <b>SHINY GOLD</b>!</div>',
      rows: ELEMENTS.map((E) => ({
        title: `${E.kanji}  ${E.name} EGG`, right: pts(price), blurb: E.blurb,
        disabled: p.score < price, why: `You need ${pts(price - p.score)} more for an egg.`,
        go: () => { this._push(index, { v: 'lairbuy', site: top.site, el: E.id, cursor: 0 }); return null; },
      })),
    };
  },

  /** ARE YOU SURE. No is first, and the cursor opens on it. */
  _v_lairbuy(index, p, top) {
    const E = ELEMENT_BY_ID[top.el] ?? ELEMENTS[0];
    const price = this.H.lair.eggPrice();
    return {
      head: 'BUY IT?',
      body: `<div class="hs-note">A <b>${esc(E.name)} DRAGON EGG</b> for ${pts(price)}. One dragon each — this one is yours for good.</div>`,
      rows: [
        { title: 'NO, KEEP LOOKING', go: () => { this._pop(index); return null; } },
        {
          title: `YES, BUY THE EGG FOR ${pts(price)}`,
          go: () => {
            if (!this.H.lair.buyEgg(p, this._home(top), E.id)) return null;
            // out of the question and out of the egg list, back to the lair
            this._pop(index); this._pop(index);
            return null;
          },
        },
      ],
    };
  },

  /**
   * NAME HER. Six ideas from her kind's list and everybody's, never a
   * kitten's name. SHOW ME OTHER NAMES is the last row and the row count
   * never changes, so the cursor on it stays on it press after press.
   * Typing a name is a follow-up: four kittens, one keyboard.
   */
  _v_lairname(index, p, top) {
    const L = this.H.lair;
    const D = L.dragonOf(p);
    if (!D?.born) return { head: 'NAME YOUR DRAGON', rows: [{ title: 'BACK', go: () => { this._pop(index); return null; } }] };
    const E = ELEMENT_BY_ID[D.el] ?? ELEMENTS[0];
    // seven drawn and her own name taken out: always six, so the rows never shift
    const ideas = nameIdeas(D.el, (D.seed ?? 0) + (top.rev ?? 0) * 7919, 7).filter((n) => n !== D.name).slice(0, 6);
    const rows = ideas.map((nm) => ({ title: nm, go: () => { L.name(p, nm); this._pop(index); return null; } }));
    if (D.name) rows.unshift({ title: `KEEP ${D.name}`, go: () => { this._pop(index); return null; } });
    rows.push({ title: 'SHOW ME OTHER NAMES', go: () => { top.rev = (top.rev ?? 0) + 1; return null; } });
    return {
      head: 'NAME YOUR DRAGON',
      body: `<div class="hs-note">A ${D.rare ? '<b>SHINY GOLD</b> ' : ''}${esc(E.name)} dragon! What is she called?</div>`,
      rows,
    };
  },

  /** HER LOOK: each row steps one thing along, and she says it in her new voice. */
  _v_laircustom(index, p, top) {
    const L = this.H.lair;
    const D = L.dragonOf(p);
    if (!D?.born) return { head: 'CUSTOMIZE', rows: [{ title: 'BACK', go: () => { this._pop(index); return null; } }] };
    const E = ELEMENT_BY_ID[D.el] ?? ELEMENTS[0];
    const n = tintCount(D);
    const k = (D.tint ?? 0) % n;
    return {
      head: 'CUSTOMIZE',
      body: `<div class="hs-note hs-lair"><span class="hs-swatch" style="background:${hex(tintOf(D))}"></span> <b>${esc(dragonName(D).toUpperCase())}</b> — ${esc(moodOf(D).name)}, ${esc(voiceOf(D).name)}.</div>`,
      rows: [
        { title: 'HER COLOUR', right: D.rare && k === E.tints.length ? 'SHINY GOLD' : `${k + 1} OF ${n}`, blurb: 'Press again for the next one.', go: () => { L.restyle(p, 'tint'); return null; } },
        { title: 'HER VOICE', right: voiceOf(D).name, blurb: 'Press to hear the next one.', go: () => { L.restyle(p, 'voice'); return null; } },
        { title: 'WHO SHE IS', right: moodOf(D).name, blurb: 'Playful, brave, sleepy or cheeky — it changes what she does.', go: () => { L.restyle(p, 'mood'); return null; } },
      ],
    };
  },

  /** GROW UP: cannot be undone, so it asks, and opens on no. */
  _v_lairevolve(index, p, top) {
    const D = this.H.lair.dragonOf(p);
    const nm = dragonName(D).toUpperCase();
    return {
      head: 'GROW UP?',
      body: `<div class="hs-note">${esc(nm)} will grow into a <b>GROWN DRAGON</b>, four kittens long! She will be too big for tag, but she still flies with you on walks. Riding her in the arena comes in the next update. There is no shrinking back.</div>`,
      rows: [
        { title: `NO, KEEP ${nm} LITTLE`, go: () => { this._pop(index); return null; } },
        { title: 'YES, GROW UP!', go: () => { this.H.lair.evolve(p); this._pop(index); return null; } },
      ],
    };
  },
};
