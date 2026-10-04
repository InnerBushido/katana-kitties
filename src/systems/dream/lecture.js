import { HONOR, FALL } from './stories.js';
import { marks } from './storyscene.js';

/* ---------------------------------------------------------------------------
   LIONHEART'S TWO TALKS — when one of them plays, and who is in it.

   Richard: "Can make this a cutscene that plays when the players get near
   Lionheart after they try to get in the easy way. We can also have a similar
   cutscene/narration play if the player falls while trying to get to the
   Dream Dojo ... These cutscenes only play once. If played for all players,
   can be once per play or if individual cutscene, can be once per player ...
   if more than one player is nearby (entering the dojo or about to enter) then
   all the players are in the cutscene."

   So: ONCE PER KITTEN PER AFTERNOON. The scene is everybody's who is there,
   and a kitten who has heard a talk is not made to sit through it again just
   because her sister earned it later. HONOR outranks FALL — it is the longer
   talk and it already says "never run from a little struggle" — so a kitten
   who both tried the wall and fell hears HONOR and is marked as having heard
   both.

   WHAT IT ASKS. Only `Approach`'s two flags (`cheat`, `fell`), whether she is
   IN (she stood on the pad, so she came the proper way since), and whether she
   is within `NEAR` of Lionheart. It never starts while anybody is in a tube or
   the simulator: a scene would take them out (`DreamDojo.update` calls
   `exitAll` under a scene), and a talk that throws a sister out of a drill
   she was halfway through is a worse thing than the talk is good. It waits
   instead, and plays when the arcade is quiet.

   SPENT ON START (non-negotiable 7): the kittens are marked heard and their
   flags cleared here, before `StoryScene.start`, so a skip at the first frame
   has spent it exactly as watching to the end would.
--------------------------------------------------------------------------- */

/** How close to Lionheart a kitten walks before he starts — a little more than
 *  the talk radius, so it starts as she arrives rather than when she presses. */
export const NEAR = 9.6;
/** Who else is "nearby": anybody on the island or on the way to it. */
export const CAST_R = 34;

export class Lecture {
  /** @param {import('../dreamdojo.js').DreamDojo} dream */
  constructor(dream) {
    this.dream = dream;
    /** name → { honor, fall } heard this afternoon. */
    this.heard = new Map();
  }

  _heard(p) {
    const k = p.style?.name ?? p.name;
    let h = this.heard.get(k);
    if (!h) this.heard.set(k, (h = { honor: false, fall: false }));
    return h;
  }

  /** Which talk she is owed, if any: 'honor', 'fall' or null. Pure on the flags. */
  owed(p) {
    const s = this.dream.approach?.of(p);
    if (!s?.inside) return null;
    const h = this._heard(p);
    if (s.cheat && !h.honor) return 'honor';
    if (s.fell && !h.fall && !h.honor) return 'fall';
    return null;
  }

  /** Whether the game is in a state a talk may start in. */
  quiet() {
    const D = this.dream;
    const g = D.game;
    if (!g.storyScene || g.storyScene.active) return false;
    if (g._sceneActive?.()) return false;
    if (g.tournament?.active || g.travel || g._finaleDue) return false;
    if (D.busy) return false;
    return true;
  }

  update() {
    const D = this.dream;
    const g = D.game;
    if (!D.lion || !D.layout) return null;
    let kind = null;
    for (const p of g.players ?? []) {
      if (!p || !this._eligible(p)) continue;
      const lx = D.lion.position.x;
      const lz = D.lion.position.z;
      if (Math.hypot(p.position.x - lx, p.position.z - lz) > NEAR) continue;
      const o = this.owed(p);
      if (o === 'honor') { kind = 'honor'; break; }
      if (o === 'fall') kind = 'fall';
    }
    if (!kind || !this.quiet()) return null;
    return this.play(kind);
  }

  _eligible(p) {
    const D = this.dream;
    return !p.mount && !p.rideAlong && !p.pandaMount && !p.carried && !p.angel && !p.ko
      && D.realmOf(p) !== 'sim' && !D.st[p.index]?.phase;
  }

  /** Stand the party on its marks, spend the talk, and roll it. */
  play(kind) {
    const D = this.dream;
    const g = D.game;
    const A = D.arcadePos;
    const cast = (g.players ?? []).filter((p) => p && this._eligible(p)
      && Math.hypot(p.position.x - A.x, p.position.z - A.z) < CAST_R);
    /* Whoever earned it first, so she is the one front and centre. */
    cast.sort((a, b) => (this.owed(b) === kind) - (this.owed(a) === kind));
    const spots = marks(D.lion.position, A, cast.length);
    cast.forEach((p, i) => {
      const m = spots[i];
      const y = A.y;
      p.position.set(m.x, y, m.z);
      p.group?.position.set(m.x, y, m.z);
      p.velocity?.set(0, 0, 0);
      p.onGround = true;
      p.facing = m.facing;
      /* AND THE DRAWING TOO. The billboard picks its view off its OWN
         `facing`, which only `Player.update` copies across — and kittens are
         not ticked under a scene. Without this she stood on her mark facing
         him and was drawn face-on to the over-the-shoulder lens (the shrine
         scene does the same, shrinescene.js). */
      if (p.sprite) p.sprite.facing = m.facing;
      p.camTarget?.set(m.x, y, m.z);
      if (p.sprite && p.anim) p.sprite.row = p.anim.idle;
      // Spent now: heard, and the flags that earned it cleared.
      const h = this._heard(p);
      const s = D.approach.of(p);
      if (kind === 'honor') { h.honor = true; h.fall = h.fall || s.fell; } else h.fall = true;
      if (kind === 'honor') s.cheat = false;
      s.fell = false;
      s.inside = true;
    });
    const rows = kind === 'honor' ? HONOR : FALL;
    return g.storyScene.start(kind, rows, D.storyCtx(spots.map((m) => ({ x: m.x, y: A.y, z: m.z }))), cast)
      ? kind : null;
  }

  reset() { this.heard.clear(); }
}
