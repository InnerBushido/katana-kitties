/* ---------------------------------------------------------------------------
   THE TREEHOUSE SLIDE, ASKED FOR. Richard, Oct 2026: "when the player gets to
   the top, a menu appears and the player can choose 'Ride down in normal
   view' and 'Ride down in First Person View' ... if user chooses first person,
   then we have the camera go to where the players head is, like we do with the
   window, and then they walk to the top of the slide and slide down in first
   person view ... also allow the player to choose the 'Ride down in normal
   view' option to make them walk to the start automatically and ride down with
   normal camera view but maybe have the camera kind of follow them from a
   dynamic 3rd person view while riding it down."

   So: standing on the cabin roof near the gap in its rail opens a card (NO
   first, like every question — "no, I'll stay up here" is the one that does
   nothing). Either ride walks her to the mouth on her own (`Player.autoWalk`,
   the stick is dead for it) and Housing's `_slide` takes her from there, the
   way it takes anybody who walks in by hand — which still works, and closes
   the card. The camera is `Player.rideCam`: a lens at her eyes, or a chase
   lens behind her on the line she is travelling, applied over the ordinary
   one so neither has to know the other.

   WHO SEES HER. First person hides her from HER OWN lens only (`hiddenFrom`,
   asked per pane in `Game._faceAll`); a sister's pane draws her riding down
   as always. And she gets a pane of her own for it, as a window look does,
   or a shared pane would put her sister's camera in her head.
--------------------------------------------------------------------------- */

/** Near the mouth, on the roof: the card opens. Further than `away`: it may open again. */
export const SLIDE_ASK = { near: 2.4, away: 3.8, dy: 0.8 };
/** Her walk to the mouth: how far behind it she lines up, and how long she may take before giving up. */
export const SLIDE_WALK = { approach: 1.2, giveUp: 7 };
/** After the run, how long the ride camera holds before it hands back. */
export const SLIDE_OUT = 0.8;
/* WHERE HER EYES GO, first person: this far down the chute's own path, not
   along her heading. The heading was tried first and on a spiral it is the
   TANGENT, so the lens stared out over the rail at sky, a trunk and a wall
   with the chute out of the bottom of the frame for the whole run. */
export const SLIDE_LOOK = 4;

/**
 * The point `dist` further down the path than she is. `from` is the segment
 * she was last on and the search only runs FORWARD from it: the spiral lies
 * over itself, so the nearest segment in plan (or even in 3D, at a lap's
 * pitch) can be a lap below her. Pure; returns { seg, x, y, z }.
 */
export function aheadOnPath(marks, x, y, z, dist, from = 0) {
  let seg = from, best = Infinity;
  for (let k = from; k < Math.min(marks.length - 1, from + 4); k++) {
    const a = marks[k], b = marks[k + 1];
    const ex = b.x - a.x, ey = b.y - a.y, ez = b.z - a.z;
    const L2 = ex * ex + ey * ey + ez * ez || 1;
    const u = Math.max(0, Math.min(1, ((x - a.x) * ex + (y - a.y) * ey + (z - a.z) * ez) / L2));
    const d = Math.hypot(a.x + ex * u - x, a.y + ey * u - y, a.z + ez * u - z);
    if (d < best) { best = d; seg = k; }
  }
  // walk `dist` along the path from her foot on segment `seg`
  const a0 = marks[seg], b0 = marks[seg + 1];
  const ex = b0.x - a0.x, ey = b0.y - a0.y, ez = b0.z - a0.z;
  const L0 = Math.hypot(ex, ey, ez) || 1;
  const u0 = Math.max(0, Math.min(1, ((x - a0.x) * ex + (y - a0.y) * ey + (z - a0.z) * ez) / (L0 * L0)));
  let left = dist + u0 * L0, k = seg;
  for (; k < marks.length - 1; k++) {
    const a = marks[k], b = marks[k + 1];
    const L = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
    if (left <= L) {
      const t = L ? left / L : 0;
      return { seg, x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    }
    left -= L;
  }
  /* PAST THE END, ON ALONG THE RUN-OUT, LEVEL. Clamped to the last mark the
     lens stared down into the red bed of the chute for the last second of
     the ride — the last mark is on the floor a metre in front of her. */
  const a = marks[marks.length - 2], e = marks[marks.length - 1];
  const el = Math.hypot(e.x - a.x, e.z - a.z) || 1;
  return { seg, x: e.x + ((e.x - a.x) / el) * left, y: e.y, z: e.z + ((e.z - a.z) / el) * left };
}

export class SlideRides {
  constructor(housing) {
    this.H = housing;
    /** index -> { S, fpv, phase: 'walk' | 'ride' | 'out', t } */
    this.rides = new Map();
    /** index -> the slide whose card she has been shown and not walked away from */
    this.asked = new Map();
  }

  /** The slide whose mouth she is standing at, if any. */
  mouthAt(p, I) {
    for (const S of I.slides ?? []) {
      const m = S.marks[0];
      if (Math.abs(p.position.y - S.top) > SLIDE_ASK.dy) continue;
      if (Math.hypot(p.position.x - m.x, p.position.z - m.z) < SLIDE_ASK.near) return S;
    }
    return null;
  }

  /** Is she on a ride she asked for (walking to it, on it, or the camera handing back)? */
  riding(p) {
    return this.rides.has(p?.index);
  }

  /** Is she riding with her eyes as the lens? */
  firstPerson(p) {
    return !!this.rides.get(p?.index)?.fpv;
  }

  /**
   * Should THIS pane's lens leave her out? Hers, first person, while the lens
   * is in her head — which is past the ride's end too, as the lens eases back
   * out (`_rcFpv` is the mode it is easing out of). Asking `firstPerson`, the
   * ride, put her back the moment it ended, round a lens still inside her.
   */
  hiddenFrom(p, members) {
    return (this.firstPerson(p) || (!this.riding(p) && !!p._rcFpv)) && (p.rideCamW ?? 0) > 0.6 && !!members?.includes(p.index);
  }

  update(dt, players) {
    const G = this.H.game;
    for (const p of players) {
      if (!p?.position) continue;
      const R = this.rides.get(p.index);
      if (R) { this._ride(dt, p, R); continue; }
      // the card: once per visit to the mouth, and never over another card
      const I = this.H.isles.find((I) => I.slides?.length && I.home && this.H.allowed(p, I.home));
      const S = I ? this.mouthAt(p, I) : null;
      const was = this.asked.get(p.index);
      if (was) {
        const m = was.marks[0];
        if (Math.hypot(p.position.x - m.x, p.position.z - m.z) > SLIDE_ASK.away || Math.abs(p.position.y - was.top) > SLIDE_ASK.dy * 2) this.asked.delete(p.index);
        // she walked in by hand while it was up: the slide answered for her
        if ((p.slideT ?? 0) > 0 && G.inspector?.extOf?.(p.index) === G.housingCards
          && G.housingCards?._top?.(p.index)?.v === 'slide') G.inspector.closeOne(p.index);
        continue;
      }
      if (!S || (p.slideT ?? 0) > 0 || p.mount || p.rideAlong || p.ko) continue;
      if (G.inspector?.cards?.[p.index]?.state) continue;
      if (G.housingCards?.open(p.index, 'slide', { uid: S.uid })) this.asked.set(p.index, S);
    }
  }

  /** Her answer (cards.js `_v_slide`). */
  start(p, fpv) {
    const S = this.asked.get(p.index);
    if (!S) return false;
    const [m0, m1, m2] = S.marks;
    const L = Math.hypot(m1.x - m0.x, m1.z - m0.z) || 1;
    const ux = (m1.x - m0.x) / L, uz = (m1.z - m0.z) / L;
    // lined up behind the mouth on its own axis, so she walks in straight between the lips
    p.autoWalk = [
      { x: m0.x - ux * SLIDE_WALK.approach, z: m0.z - uz * SLIDE_WALK.approach },
      { x: m0.x, z: m0.z },
      { x: m2.x, z: m2.z },
    ];
    this.rides.set(p.index, { S, fpv, phase: 'walk', t: 0 });
    p.rideCam = { fpv };
    this.H.game.toast(fpv ? `${p.name} looks down the slide… here we go!` : `${p.name} sits at the top of the slide… WHEEE!`, p.index);
    return true;
  }

  _ride(dt, p, R) {
    R.t += dt;
    if (R.fpv && R.phase !== 'out') {
      const A = aheadOnPath(R.S.marks, p.position.x, p.position.y, p.position.z, SLIDE_LOOK, R.seg ?? 0);
      R.seg = A.seg;
      (p.rideCam.look ??= { x: 0, y: 0, z: 0 });
      p.rideCam.look.x = A.x; p.rideCam.look.y = A.y; p.rideCam.look.z = A.z;
    }
    if (R.phase === 'walk') {
      if ((p.slideT ?? 0) > 0) { R.phase = 'ride'; R.t = 0; p.autoWalk = null; this.H.game.audio?.play?.('jump', 0.6); }
      else if (R.t > SLIDE_WALK.giveUp || !p.autoWalk?.length) { this._end(p); this.H.game.toast('Something is in the way of the slide.', p.index); }
      return;
    }
    if (R.phase === 'ride') {
      if ((p.slideT ?? 0) <= 0 && Math.hypot(p.velocity.x, p.velocity.z) < 1.5) { R.phase = 'out'; R.t = 0; }
      return;
    }
    if (R.t >= SLIDE_OUT) this._end(p);
  }

  _end(p) {
    this.rides.delete(p.index);
    p.autoWalk = null;
    p.rideCam = null;
  }

  /** A new game, or the isle rebuilt under her. */
  drop(index) {
    const p = this.H.game.players?.[index];
    if (p && this.rides.has(index)) this._end(p);
    this.asked.delete(index);
  }
}
