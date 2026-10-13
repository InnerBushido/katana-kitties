import * as THREE from 'three';

/* ---------------------------------------------------------------------------
   HOME BOONS — what an afternoon at home is worth in the NEXT arena battle.

   Three, one per thing she does at home, and each is a different SHAPE of
   help so they stack without one being the others' sum:

     meal   GREEN. A meal eaten together at the kotatsu: +5/10/15% of her
            ordinary bar as green past the top, by how many sat down to eat
            (1, 2, 3+). At the start of round one and after every round she
            LOST — the same two moments the arena already heals her, so it is
            a top-up on a heal and never a gift to the kitten who is winning.
            It goes in through `setRoundBonus` ON TOP of whatever the feast
            banked, which is what "stacks with the feast green" means: one bar,
            one green slice, two sources.
     onsen  RED. Double damage for the first 15 seconds of every round.
     bless  WHITE. The shrine. On a ring-out she does not fall: angel wings,
            up she goes (about twenty feet), three seconds of flight with her
            katana free, then the wings blink and fade. Once per ROUND.

   ALL OF THEM ARE FOR THE NEXT BATTLE ONLY. Earned at home they sit in
   `store.boons[name]` (saved, so a nap before tea still counts after a
   reload); `arm` moves them onto the kittens when a tournament BEGINS and
   empties the store, and `disarm` takes them off when it finishes. A kitten
   who earns one in the middle of a battle keeps it for the one after.

   NON-NEGOTIABLE 3 IS UNTOUCHED. Nothing here strikes anybody: the red is a
   multiplier `strikePlayers` reads AFTER its gate has said yes, the green is
   a ceiling, and the wings are a reprieve from the edge of the world.

   THE AURA tells her — and everybody watching — what she is carrying. One
   small orbiting spark per boon in its own colour; with two or three they
   orbit together and read as one swirling multicoloured orb. Faint while
   it is only banked (at home), bright while it is live in the ring.
--------------------------------------------------------------------------- */

export const BOON = {
  /** Green as a percentage of her ordinary bar, by how many ate together. */
  mealPct: [5, 10, 15],
  /** Seconds into each round that the onsen's red lasts, and how hard. */
  onsenT: 15,
  onsenK: 2,
  /** The wings: how long, how high, and how hard gravity pulls meanwhile. */
  wingT: 3,
  wingRise: 6.5,
  wingGravity: 0.3,
  /** The last stretch of the flight, when the wings blink to say "land!". */
  wingBlink: 1,
};

export const BOON_COLOURS = { onsen: 0xff4646, bless: 0xffffff, meal: 0x5dff7a };

/** Green for a meal eaten by `diners` kittens — the pure rule, for checks. */
export function mealPct(diners) {
  const n = Math.max(1, Math.min(3, diners | 0));
  return BOON.mealPct[n - 1];
}

/** Is a home boon's onsen red live at round-clock `t`? */
export function onsenLive(t) {
  return Number.isFinite(t) && t >= 0 && t < BOON.onsenT;
}

export class HomeBoons {
  constructor(housing) {
    this.H = housing;
    this.game = housing.game;
    /** Per player index: { group, sparks[], wings } — drawn only when needed. */
    this._fx = new Map();
  }

  get store() {
    const S = this.H.store;
    if (!S.boons || typeof S.boons !== 'object') S.boons = {};
    return S.boons;
  }

  /** What `name` has banked, or null. */
  banked(name) { return this.store[name] ?? null; }

  /**
   * GIVE HER ONE. A meal that pays more replaces one that paid less, never
   * the other way round — the second, smaller meal of the afternoon must not
   * be a way of losing green.
   */
  grant(p, kind, value = true) {
    const name = p.style?.name;
    if (!name) return false;
    const B = (this.store[name] ??= {});
    if (kind === 'meal') B.meal = Math.max(B.meal ?? 0, value);
    else B[kind] = true;
    this.H.save?.();
    return true;
  }

  /** A tournament is beginning: what each kitten banked goes on her. */
  arm(players) {
    for (const p of players) {
      const name = p.style?.name;
      const B = name ? this.store[name] : null;
      p.homeBoon = B ? { ...B } : null;
      p.wingRound = -1;
      if (B) delete this.store[name];
    }
    this.H.save?.();
  }

  /** ...and finishing: it was for that battle only. */
  disarm(players) {
    for (const p of players) {
      p.homeBoon = null;
      this._land(p);
    }
  }

  /**
   * THE MEAL'S GREEN for the round about to start, in hit points. `eligible`
   * is the tournament's own answer — round one, or a round she lost.
   */
  mealHp(p, eligible) {
    const pct = p.homeBoon?.meal ?? 0;
    if (!eligible || !(pct > 0)) return 0;
    return Math.round((p.baseMaxHp ?? p.maxHp ?? 0) * pct / 100);
  }

  /** THE ONSEN'S RED: the multiplier on her blows this frame. */
  dmgK(p) {
    const T = this.game.tournament;
    if (!p?.homeBoon?.onsen || !T?.fighting) return 1;
    return onsenLive(T.t) ? BOON.onsenK : 1;
  }

  /**
   * THE SHRINE'S WINGS. Asked by the tournament at the moment a ring-out
   * would be charged; true means "not this time — she is flying". Once per
   * round: the second fall of a round is an ordinary ring-out.
   */
  wings(p, ringY = null) {
    const T = this.game.tournament;
    if (!p?.homeBoon?.bless || !T) return false;
    if (p.wingRound === T.round) return false;
    p.wingRound = T.round;
    p.wingT = BOON.wingT;
    /* A LAUNCH THAT TOPS OUT `wingRise` ABOVE THE RING, not above her — she is
       standing on the lower floor when this is asked, and twenty feet up from
       THERE can still be below the stone. Measured at her lightened gravity. */
    const rise = Math.max(BOON.wingRise, (Number.isFinite(ringY) ? ringY - p.position.y : 0) + BOON.wingRise);
    p.velocity.y = Math.sqrt(2 * 26 * BOON.wingGravity * rise);
    p.onGround = false;
    p.jumpsLeft = Math.max(p.jumpsLeft ?? 0, 2);
    this.game.toast?.(`${p.name} is BLESSED — angel wings! Fly back to the ring!`, p.index);
    this.game.audio?.play?.('angel');
    return true;
  }

  _land(p) {
    p.wingT = 0;
    const F = this._fx.get(p.index);
    if (F?.wings) F.wings.visible = false;
  }

  /** Per frame: the flight, and every kitten's aura. */
  update(dt, players, scene) {
    const T = this.game.tournament;
    for (const p of players) {
      if (p.wingT > 0) {
        p.wingT = Math.max(0, p.wingT - dt);
        // FLIGHT IS JUMPING AT WILL: every jump is a flap while the wings last
        p.jumpsLeft = Math.max(p.jumpsLeft ?? 0, 2);
        if (p.wingT === 0) this._land(p);
      }
      const live = T?.state && T.state !== 'off' && p.homeBoon;
      const kinds = [];
      const src = live ? p.homeBoon : this.banked(p.style?.name);
      if (src?.onsen && (!live || (T.fighting && onsenLive(T.t)))) kinds.push('onsen');
      if (src?.bless && (!live || p.wingRound !== T.round || p.wingT > 0)) kinds.push('bless');
      if (src?.meal && (!live || (p.bonusHp ?? 0) > 0)) kinds.push('meal');
      this._draw(p, kinds, live ? 1 : 0.45, dt, scene);
    }
  }

  _draw(p, kinds, alpha, dt, scene) {
    let F = this._fx.get(p.index);
    if (!kinds.length && !(p.wingT > 0)) {
      if (F) F.group.visible = false;
      return;
    }
    if (!F) {
      if (!scene) return;
      F = this._build();
      scene.add(F.group);
      this._fx.set(p.index, F);
    }
    F.group.visible = true;
    F.group.position.copy(p.position);
    F.t = (F.t ?? 0) + dt;
    /* THE SWIRL. Each boon is a spark on its own tilted orbit, and with more
       than one they share the turn a third of a circle apart — at speed that
       is one orb changing colour as it spins, which is the "combined" look. */
    F.sparks.forEach((s, k) => {
      const kind = kinds[k];
      s.visible = !!kind && alpha > 0;
      if (!kind) return;
      s.material.color.setHex(BOON_COLOURS[kind]);
      s.material.opacity = 0.85 * alpha;
      const a = F.t * 3.2 + (k * Math.PI * 2) / Math.max(1, kinds.length);
      s.position.set(Math.cos(a) * 1.3, 1.4 + Math.sin(F.t * 2.1 + k) * 0.5, Math.sin(a) * 1.3);
    });
    F.glow.visible = kinds.length > 0;
    if (kinds.length) {
      const c = BOON_COLOURS[kinds[Math.floor(F.t * 2) % kinds.length]];
      F.glow.material.color.lerp(new THREE.Color(c), Math.min(1, dt * 4));
      F.glow.material.opacity = 0.18 * alpha;
    }
    /* THE WINGS. PLACEHOLDER ART: two white feathered fans drawn here, flapping;
       they blink for the last second, which is the "land now" warning. */
    const W = F.wings;
    W.visible = p.wingT > 0 && !(p.wingT < BOON.wingBlink && Math.floor(p.wingT * 10) % 2 === 0);
    if (W.visible) {
      const flap = Math.sin(F.t * 14) * 0.5;
      W.children[0].rotation.y = 0.5 + flap;
      W.children[1].rotation.y = -0.5 - flap;
      W.rotation.y = p.facing ?? p.group?.rotation?.y ?? 0;
      const fade = Math.min(1, p.wingT / BOON.wingBlink);
      for (const w of W.children) w.material.opacity = 0.35 + 0.6 * fade;
    }
  }

  _build() {
    const group = new THREE.Group();
    group.name = 'home-boon-aura';
    const sparkGeo = new THREE.SphereGeometry(0.22, 10, 8);
    const sparks = [0, 1, 2].map(() => {
      const m = new THREE.Mesh(sparkGeo, new THREE.MeshBasicMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      group.add(m);
      return m;
    });
    const glow = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), new THREE.MeshBasicMaterial({
      color: 0xffffff, transparent: true, opacity: 0.15, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.position.y = 1.3;
    group.add(glow);
    const wings = new THREE.Group();
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.quadraticCurveTo(1.2, 1.6, 2.8, 1.4);
    shape.quadraticCurveTo(2.2, 0.6, 2.4, 0.1);
    shape.quadraticCurveTo(1.6, -0.2, 1.9, -0.7);
    shape.quadraticCurveTo(0.9, -0.6, 0, 0);
    const wingGeo = new THREE.ShapeGeometry(shape);
    for (const side of [1, -1]) {
      const pivot = new THREE.Group();
      const m = new THREE.Mesh(wingGeo, new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false,
      }));
      m.scale.set(side, 1, 1);
      pivot.add(m);
      pivot.material = m.material;
      pivot.position.set(0.2 * side, 1.9, -0.3);
      wings.add(pivot);
    }
    wings.visible = false;
    group.add(wings);
    return { group, sparks, glow, wings, t: 0 };
  }
}
