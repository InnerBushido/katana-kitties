import { ORB_BY_ID, countsOf } from '../../entities/powerorb.js';
import { HOLO } from '../../world/simworld.js';
import { HoloPanel } from './holo.js';
import { HOW_TO } from './gallery.js';
import { CLAN_ARENA } from './hall.js';

/* ---------------------------------------------------------------------------
   LIONHEART'S RUNDOWN OF WHAT SHE IS WEARING.

   Richard: "After the Kotodama orbs awaken, then when the player enters the
   holographic arena, they can be prompted to have a rundown of all their
   currently equipped Kotodama orbs and they will be walked through and
   explained what each one does and teach them how to use it."

   One card per KIND she wears, over her own head, in the order she wears
   them: what it is, how many, what that many does (the orb's own `detail`,
   which is the same sentence the profile screen prints — one source), and
   which of HER buttons does it. Then her clan's ring power, if she has one.

   INTERACT turns the page. Walking away closes it — nothing is lost by
   leaving a rundown half read, so it needs no question to leave (7 is about
   things that cannot be taken back). It is offered, never forced: Lionheart
   SAYS there is one ("talk to me"), and she chooses to.

   IT READS HER REAL ORBS, NOT HER LOANS. A rundown of what she borrowed from
   the gallery five minutes ago would be a rundown of a kit she does not have.
--------------------------------------------------------------------------- */

export class Rundown {
  constructor(dream, p) {
    this.dream = dream;
    this.p = p;
    this.page = 0;
    this.pages = this._pages();
    this.panel = new HoloPanel({ w: 8.4, h: 4.2, px: 96, edge: HOLO.gold });
    this.panel.position.y = (p.height ?? 2.6) + 3.6;
    p.group.add(this.panel);
    this._paint();
  }

  _pages() {
    const p = this.p;
    const k = (a) => `[${this.dream.key(p, a)}]`;
    const ids = p.powerOrbs ?? [];
    const counts = countsOf(ids);
    const kinds = [...new Set(ids)];
    const pages = [[
      { text: 'YOUR KIT', size: 2.0, color: HOLO.gold, glow: true },
      { text: `${ids.length} Kotodama on you, ${kinds.length} kinds`, size: 1.3 },
      { text: 'Lionheart will walk you through them', size: 1.05, color: 0x9fefff },
      { text: `${k('interact')} next page  ·  walk away to stop`, size: 0.95, color: HOLO.gold },
    ]];
    for (const id of kinds) {
      const s = ORB_BY_ID[id];
      if (!s) continue;
      const n = counts[id];
      pages.push([
        { text: `${s.kanji}  ${s.name}${n > 1 ? `  ×${n}` : ''}`, size: 2.0, color: s.color, glow: true, jp: true },
        { text: s.blurb, size: 1.15 },
        { text: s.detail(n, counts), size: 1.2, color: 0x9fefff },
        { text: (HOW_TO[id] ?? '').replace(/\{(\w+)\}/g, (_, a) => k(a)), size: 1.05, color: HOLO.gold },
      ]);
    }
    const real = p.dreamOath ? p.dreamOath.was : p.clan;
    if (real) {
      pages.push([
        { text: real.name.toUpperCase(), size: 2.0, color: real.color, glow: true },
        { text: real.buff.label, size: 1.25 },
        { text: (CLAN_ARENA[real.id] ?? '').replace(/\{(\w+)\}/g, (_, a) => k(a)), size: 1.05, color: HOLO.gold },
      ]);
    }
    pages.push([
      { text: "THAT'S YOUR KIT", size: 1.9, color: HOLO.gold, glow: true },
      { text: 'Try any orb in the Kotodama Gallery', size: 1.1 },
      { text: 'and any clan in the Trial Hall', size: 1.1 },
    ]);
    return pages;
  }

  _paint() {
    const lines = [...this.pages[this.page]];
    const last = this.page >= this.pages.length - 1;
    lines.push({
      text: `${this.page + 1} / ${this.pages.length}  ·  [${this.dream.key(this.p, 'interact')}] ${last ? 'done' : 'next'}`,
      size: 0.85, color: 0x6fbfd0,
    });
    this.panel.set(lines, HOLO.gold);
  }

  /** INTERACT. Returns false on the last page — the rundown is over. */
  next() {
    if (this.page >= this.pages.length - 1) return false;
    this.page++;
    this.dream.game.sfx?.('menu');
    this._paint();
    return true;
  }

  faceCamera(camera) { this.panel.faceCamera(camera); }

  dispose() { this.panel.removeFromParent(); }
}
