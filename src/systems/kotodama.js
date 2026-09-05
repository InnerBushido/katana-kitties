import {
  POWER_ORBS, ORB_BY_ID, ORB_IDS, WORLD_ORB_IDS, MAX_EQUIPPED,
  PowerOrb, PowerOrbPickup,
  orbPrice, orbSellPrice, orbPriceFor, orbSellPriceFor, stockFor,
} from '../entities/powerorb.js';
import { KotodamaStall } from '../entities/stall.js';

/* ---------------------------------------------------------------------------
   THE AWAKENING — what happens to the Kotodama at 100% mischief.

   This system owns one event and everything downstream of it. At the moment
   the last knockable thing in the world goes over:

     1. the plain orbs each kitten collected are COUNTED
     2. whoever has more is given a Powerup Kotodama, drawn at random
        (a tie gives one to both — see below)
     3. every plain orb is dissolved: off both kittens, out of the world
     4. eight Powerup Kotodama — one of each — are scattered over the islands
     5. a dealer's stall appears in the market

   A TIE GIVES THE PRIZE TO BOTH, AND THAT INCLUDES 0-0. This is the rule the
   whole feature turns on and it is not generosity, it is the same argument the
   shared dragon-ball tally makes: these are two sisters, one of them is
   younger, and a prize that exactly one of them can win produces an argument
   rather than a game. Two kittens who never touched a plain orb both get one
   anyway — the alternative is an endgame that opens by telling both of them
   they lost.

   THE PRIZE IS RANDOM, WHICH IS THE POINT. A chosen prize is a menu, and a
   menu at the top of the endgame means both girls pick the same obvious thing
   and the trading never happens. A random one is the first card in the hand:
   it is a thing you have, not a thing you wanted, which is what makes the
   sentence "I'll swap you" occur to a nine-year-old unprompted.

   WHY THE PLAIN ORBS GO. Leaving them would put two kinds of Kotodama in the
   world at once, one of which does nothing, and the plain one is much bigger
   and much louder on screen — the teaching overlay is 6 units across. It would
   drown the thing that replaces it. The lesson it carried is not lost: the
   Dojo of the Turning Circle is a walkable unit circle and is untouched, and
   the worn orbs still print live `cos θ` / `sin θ` from the numbers that place
   them. See the header of `entities/powerorb.js`.
--------------------------------------------------------------------------- */

/**
 * How many lie in the world: FOUR PER PLAYER.
 *
 * Two kittens get eight — one of each kind, which is the number this was
 * designed around and is unchanged. Four kittens get sixteen.
 *
 * THE SCARCITY THAT MATTERS IS PER PLAYER, AND THAT IS WHAT IS HELD FIXED. The
 * original reasoning against sixteen was that two girls could wander into a
 * full set each without ever speaking, because this whole feature exists so
 * that they do — the interesting object in it is not the orb, it is the
 * sentence "I'll swap you my Ward". At four players sixteen orbs is the same
 * four-per-kitten it always was, so that pressure is exactly where it was.
 *
 * IT DOES RELAX "NOTHING IS STACKABLE BY WALKING", DELIBERATELY. Sixteen across
 * eight kinds means two of some of them, so a lucky circuit can turn up a pair.
 * The alternative is worse in a way that is not a trade-off: one Ward shared
 * between four kittens means three of them can never find one, and a power that
 * three quarters of the party can only ever see somebody else use is not
 * scarce, it is absent. Buying and trading remain the only route to a real
 * stack, because the shelf is still shallow on the four move orbs.
 *
 * NOT EVERY KIND IS OUT THERE ANY MORE. The floor is a full set of the orbs
 * that CAN be found — `WORLD_ORB_IDS`, which is the roster minus 守 Long Guard
 * — because the guarantee this number exists to keep is "every power is
 * findable on foot", and the one orb that is deliberately not findable would
 * otherwise inflate the count of the ones that are. Two kittens still get
 * exactly eight, which is the number this was designed around.
 *
 * @param {number} players how many kittens are in the world
 */
export const WORLD_PER_PLAYER = 4;
export const worldSpawnCount = (players = 2) =>
  Math.max(WORLD_ORB_IDS.length, WORLD_PER_PLAYER * players);

/** How close you have to be to walk one up. */
const PICKUP_RADIUS = 2.8;

/**
 * How far apart a leaving kitten's orbs are laid out, and the turn between
 * them.
 *
 * A RING, JITTERED, RATHER THAN A RANDOM CLOUD. Eight uniform draws inside a
 * circle put two of them on top of each other often enough to look like the
 * bug this replaced; walking the bearing by a whole turn divided by eight and
 * then wobbling it keeps them apart AND keeps them looking dropped rather than
 * arranged. The radius grows with the index so a big stack becomes a loose
 * spiral instead of a tight necklace nobody can walk into the middle of.
 *
 * THE WOBBLES ARE BOTH SMALLER THAN THEIR OWN STEP, AND THAT IS THE WHOLE
 * POINT OF THE NUMBERS. The first pass used a bearing wobble of 0.7rad against
 * a step of 45 degrees (0.785rad) — nearly the entire step, so two neighbours
 * could land on the same bearing at nearly the same radius and the fan
 * reproduced the pile it was written to replace, just less often. `DROP_ASPIN`
 * is 0.3 (17 degrees, leaving 28 between any two) and `DROP_RJIT` is under
 * `DROP_RSTEP`, so the spiral cannot fold back on itself. Worst case is a
 * chord of about 1.3 units.
 *
 * SMALL ON PURPOSE. These are hers and she has just gone; a sister standing
 * next to her should be able to pick the lot up without a hunt. `DROP_R0` is
 * a bit more than a kitten's own width.
 */
const DROP_R0 = 2.6;
const DROP_RSTEP = 0.55;
const DROP_RJIT = 0.4;
const DROP_ASPIN = 0.3;
/**
 * How much room a dropped orb asks for.
 *
 * 1.5, AND IT WAS 5 — the number `findOpenSpot` uses to perch a DRAGON. An
 * orb is a hand-sized shell you walk over. Five units of clearance plus level
 * ground for nine around it is a test almost nothing near a town passes, so
 * every fanned point failed and fell through to the SAME deterministic ring
 * the search walks — which put the pile straight back, measured at 0.37 units
 * between two orbs where the fan itself never gets closer than 1.3.
 *
 * A SEARCH THAT REFUSES EVERYWHERE IS NOT A SAFETY NET, IT IS A FUNNEL. The
 * clearance still keeps an orb out of the inside of a house and off a cliff
 * edge, which is all it was ever wanted for here.
 */
const DROP_CLEAR = 1.5;

export class Kotodama {
  /**
   * @param {object} game the Game — used for scene, players, toasts and sfx
   */
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.scene = game.scene;

    /** False until 100% mischief. Nothing below exists before that. */
    this.awakened = false;
    /** @type {PowerOrbPickup[]} */
    this.pickups = [];
    /** @type {KotodamaStall|null} */
    this.stall = null;

    /** What the dealer has left. Four of each stat orb, one of each move, plus
     *  one of everything per player past the second — see `stockFor`, which
     *  owns that split and the reasoning for it. */
    this.stock = {};
    this.price = 0;
    this.sellPrice = 0;
    this.forParty(game.partySize ?? 2, { restock: true });
  }

  /**
   * Re-price the shelf, and re-stock it, for a party of `players`.
   *
   * TWO CALLERS WITH DIFFERENT NEEDS, which is what `restock` separates. At
   * boot the shelf is being created and every count is the opening one. When
   * somebody JOINS OR LEAVES mid-game the shelf is already half sold, and
   * resetting it would either hand the party a free restock or confiscate what
   * the dealer has left — so the counts are ADJUSTED by the difference instead,
   * and never below zero.
   *
   * The price moves either way, because it is a share of a fixed pot and the
   * number of people splitting it has changed. That is visible to the girls in
   * the stall, which is the point: a fourth player arriving makes everything
   * cheaper because everybody's share just got smaller.
   */
  forParty(players, { restock = false } = {}) {
    const n = Math.max(1, players);
    for (const id of ORB_IDS) {
      const want = stockFor(id, n);
      if (restock || this.stock[id] == null) this.stock[id] = want;
      else {
        const was = stockFor(id, this._party ?? 2);
        this.stock[id] = Math.max(0, this.stock[id] + (want - was));
      }
    }
    this._party = n;
    /* THE SHELF PRICE, WHICH IS NOT EVERY ORB'S PRICE ANY MORE. These two stay
       the base — the number the purse line and the footer print, and the one
       eight of the nine kinds actually cost — and `priceOf` applies the one
       spec that has a multiplier. Keeping the base named means the shop screen
       can still say "buy 650 / sell 488" and then show 守 at its own figure on
       its own row, rather than printing a range nobody can act on. */
    this.price = orbPrice(this.world.pointsTotal, n);
    this.sellPrice = orbSellPrice(this.world.pointsTotal, n);
    this.stall?.setStock(this.stock);
  }

  /* ------------------------------ the event ------------------------------ */

  /**
   * Fire the Awakening. Idempotent — calling it twice is free.
   *
   * IT IS SEPARATE FROM THE FINALE SCENE ON PURPOSE. The scene is 63 seconds
   * of Patchfur talking over a camera climbing out of the archipelago, and it
   * can be skipped on the first frame. Hanging the world's biggest state
   * change off the END of a skippable cutscene means a kid who presses Start
   * gets no orbs at all; hanging it off the start means the world changes
   * behind a scene nobody can see it through. It runs on the frame the last
   * prop goes over, before the scene is even queued, and the scene then plays
   * over a world that has already turned. Same reasoning as `_finaleDue`.
   */
  awaken() {
    if (this.awakened) return null;
    this.awakened = true;

    const players = this.game.players;
    const counts = players.map((p) => (p.orbs?.length ?? 0));
    const best = Math.max(...counts);
    const winners = players.filter((p, i) => counts[i] === best);

    // 3 — dissolve every plain orb, on the kittens and in the world.
    this.dissolvePlain();

    // 2 — the prize. Random per winner, so a tie is not two of the same thing
    //     unless the dice say so.
    //     Drawn from the FINDABLE orbs only — a rare shop orb arriving free at
    //     the moment the endgame opens is the one way to make it not rare, and
    //     it would also hand somebody a booster for a Ward she has not got.
    const prizes = winners.map((p) => {
      const pool = WORLD_ORB_IDS;
      const spec = ORB_BY_ID[pool[(Math.random() * pool.length) | 0]];
      this.give(p, spec.id, { quiet: true });
      return { player: p, spec };
    });

    // 4 and 5 — reseed the world, and open the shop.
    this.spawnPickups();
    this.raiseStall();

    return { counts, best, prizes, tie: winners.length > 1 };
  }

  /**
   * Take every plain Kotodama Orb out of the game.
   *
   * BOTH HALVES OR NEITHER. The worn ones are children of the scene (not of
   * the player group), and the uncollected ones are in `game.pickups`. Clear
   * only the first and six pedestals keep glowing on six hillsides, promising
   * a collectible that no longer exists — which is worse than leaving them
   * all, because a kid will fly to one.
   */
  dissolvePlain() {
    for (const p of this.game.players) {
      for (const o of p.orbs ?? []) this.scene.remove(o.group);
      p.plainOrbsHeld = p.orbs?.length ?? 0;   // kept for the toast, and only that
      p.orbs = [];
    }
    for (const pk of this.game.pickups) {
      if (!pk.taken) this.scene.remove(pk.group);
      pk.taken = true;
    }
    this.game.pickups.length = 0;
  }

  /**
   * Scatter the eight, one per kind.
   *
   * PLACED THROUGH `findOpenSpot` AND REGISTERED IN `keepClear`, like every
   * other thing that has ever been put on these islands. Four separate bugs in
   * this project came from placing something after the world was built and not
   * telling the world about it — a grotto round a perched dragon, a star under
   * a canopy — and this runs later than ALL of them, at 100% mischief, on a
   * world that is fully dressed. A spot that is merely "on the island" here
   * lands inside a house.
   */
  spawnPickups() {
    const islands = this.world.questIslands;
    if (!islands.length) return;

    /* In roster order and CYCLED, not shuffled and not random: random would
       give you three Gale orbs and no Ward often enough that a nine-year-old
       reads it as the game cheating, and the guarantee that every power is
       findable on foot is the reason the shop's prices are allowed to be
       brutal. Cycling is what keeps that guarantee once the count is more than
       one full set — sixteen orbs come out as two of each rather than as a
       random draw that could still leave a kind missing. Which ISLAND each
       lands on is decided below by index, so they are spread rather than
       piled. */
    const n = worldSpawnCount(this.game.partySize ?? this.game.players.length);
    /* WORLD_ORB_IDS, NOT ORB_IDS. 守 Long Guard is the dealer's alone: a rare
       orb you can trip over on a beach is not rare, and the cycle above would
       otherwise put one on an island in every full set. */
    const order = Array.from(
      { length: n }, (_, i) => WORLD_ORB_IDS[i % WORLD_ORB_IDS.length]
    );

    for (let i = 0; i < order.length; i++) {
      const isl = islands[i % islands.length];
      /* Spiral the seed point round the island by index so successive orbs on
         the same island do not start their search from the same place and end
         up in a line. */
      const a = (i / order.length) * Math.PI * 2 + isl.x;
      const rad = isl.radius * (0.35 + 0.4 * ((i * 7) % 5) / 5);
      const wx = isl.x + Math.cos(a) * rad;
      const wz = isl.z + Math.sin(a) * rad;

      /* CLEARANCE 7, NOT 3, AND THE REASON IS THE CANOPY. `findOpenSpot`
         measures against a tree's SOLID, which is its trunk at radius 0.9 —
         but what hides a glowing ball is the four-unit canopy over the top of
         it. This is the same mistake that buried the ice ward, and it is
         easier to make here than anywhere else in the project because this
         runs at 100% mischief, on a world that is already fully dressed. The
         bare circle is also the tell: something glowing in a clearing reads
         as deliberate from a long way off. */
      const spot = this.world.findOpenSpot(wx, wz, 7) ?? { x: wx, z: wz };
      const g = this.world.heightAt(spot.x, spot.z);
      if (!g) continue;

      const spec = ORB_BY_ID[order[i]];
      const pk = new PowerOrbPickup(spec, spot.x, g.y, spot.z);
      this.scene.add(pk.group);
      this.pickups.push(pk);
      this.world.keepClear.push({ x: spot.x, z: spot.z, r: 6 });
    }
  }

  /**
   * The dealer turns up in the market, because now there is something to sell.
   *
   * SEEDED IN THE MIDDLE OF THE MARKET STREET, AT CLEARANCE 8. The first
   * version seeded off to one side at clearance 5 and `findOpenSpot` happily
   * returned a spot in the cherry grove — every test it runs passes there,
   * because a tree's solid is its 0.9-unit TRUNK, and the thing that hid a
   * whole 4.8-unit stall was the canopy above it. Eight clears a canopy and
   * the market's own four stalls (solids at r 2.0) both.
   */
  raiseStall() {
    const spot = this.world.findOpenSpot(0, 60, 8) ?? { x: 0, z: 60 };
    const g = this.world.heightAt(spot.x, spot.z);
    this.stall = new KotodamaStall(spot.x, g ? g.y : 0, spot.z);
    this.scene.add(this.stall.group);
    /* A solid, so nobody walks through the counter — and small, well inside
       the prompt radius, so you can never be shoved out of the range of the
       thing you are standing at. */
    this.world.solids.push({ x: spot.x, z: spot.z, r: 1.9 });
    this.world.keepClear.push({ x: spot.x, z: spot.z, r: 8 });
  }

  /* ----------------------------- inventory ------------------------------- */

  /**
   * Put an orb on a kitten.
   *
   * @returns {boolean} false when she is already carrying eight — and the
   *   caller has to handle that, because every path into here can fail: a
   *   pickup she walks over, a purchase she has paid for, half of a trade.
   *   Silently dropping the ninth is how you take a girl's 650 points and
   *   give her nothing.
   */
  give(player, id, { quiet = false } = {}) {
    if (!ORB_BY_ID[id]) return false;
    if (player.powerOrbs.length >= MAX_EQUIPPED) return false;
    player.setPowerOrbs([...player.powerOrbs, id]);
    this.game.syncOrbMeshes(player);
    if (!quiet) {
      const spec = ORB_BY_ID[id];
      this.game.sfx('powerorb');
      this.game.toast(`${player.name} awakened ${spec.name} — ${spec.blurb}`, player.index);
    }
    return true;
  }

  /** Take ONE copy off her. Returns false if she hasn't got one. */
  take(player, id) {
    const at = player.powerOrbs.indexOf(id);
    if (at < 0) return false;
    const next = [...player.powerOrbs];
    next.splice(at, 1);
    player.setPowerOrbs(next);
    this.game.syncOrbMeshes(player);
    return true;
  }

  /* ------------------------------- economy ------------------------------- */

  /**
   * What this one costs, and what it pays back.
   *
   * EVERY PRICE IN THIS FILE GOES THROUGH THESE TWO. There is one orb with a
   * multiplier today and the number of places that would have to learn about
   * a second one is exactly zero — the refusal, the deduction, the toast and
   * all four screens ask here. A rare orb whose price was right in the shop
   * and wrong in the sell confirmation is the bug this shape exists to make
   * impossible.
   */
  priceOf(id) {
    return orbPriceFor(id, this.world.pointsTotal, this._party ?? 2);
  }

  sellPriceOf(id) {
    return orbSellPriceFor(id, this.world.pointsTotal, this._party ?? 2);
  }

  /** Why a purchase would fail, or null if it would go through. */
  buyRefusal(player, id) {
    if (!(this.stock[id] > 0)) return 'The dealer has none left.';
    if (player.powerOrbs.length >= MAX_EQUIPPED) return `${player.name} can only wear ${MAX_EQUIPPED}.`;
    const cost = this.priceOf(id);
    if (player.score < cost) return `${cost - player.score} more points needed.`;
    return null;
  }

  buy(player, id) {
    if (this.buyRefusal(player, id)) return false;
    const cost = this.priceOf(id);
    player.score -= cost;
    this.stock[id]--;
    this.give(player, id, { quiet: true });
    this.game.sfx('coin');
    this.game.onScoreChanged(player);
    this.game.toast(`${player.name} bought ${ORB_BY_ID[id].name} for ${cost}`, player.index);
    return true;
  }

  /**
   * Sell one back.
   *
   * IT GOES BACK ON THE SHELF. A sold orb that vanishes lets two girls destroy
   * the world's supply between them, and there are only twenty-six in
   * existence. The dealer restocking what he buys also means selling a spare
   * and buying it back later is a 25% fee rather than a mistake you cannot
   * undo — which is the difference between a shop a nine-year-old will
   * experiment with and one she is afraid of.
   */
  sell(player, id) {
    const paid = this.sellPriceOf(id);
    if (!this.take(player, id)) return false;
    player.score += paid;
    this.stock[id] = (this.stock[id] ?? 0) + 1;
    this.game.sfx('coin');
    this.game.onScoreChanged(player);
    this.game.toast(`${player.name} sold ${ORB_BY_ID[id].name} for ${paid}`, player.index);
    return true;
  }

  /* -------------------------------- trade -------------------------------- */

  /**
   * Swap a pile for a pile, both ways at once.
   *
   * IT IS ATOMIC AND IT IS CHECKED BEFORE ANYTHING MOVES. Both kittens are at
   * eight slots more often than not by the time they are trading, so a naive
   * "give hers to him, give his to her" overflows on the first half and leaves
   * one girl a copy down with nothing to show for it. Removing both sides
   * first is what makes the count conserved, and `world-check` asserts exactly
   * that: a trade cannot create or destroy an orb.
   *
   * Either side may offer nothing — a gift. That is not a simplification for
   * its own sake: the older sister giving the younger one a spare is the
   * single most likely thing to happen at this screen.
   *
   * IT TAKES A LIST NOW, AND A BARE ID IS STILL A LIST OF ONE. One orb per
   * trade meant handing over four spares was four separate agreements; the
   * trade screen offers a set (see `Side.offers`) and this is the half that
   * moves it. The single-id form is kept working rather than chased through
   * every caller, because a rule that degrades is better than one that
   * vanishes — and `world-check` still asserts the one-for-one case, which is
   * the two-player game the girls already know.
   *
   * DUPLICATES ARE COUNTED, NOT DEDUPED. A kitten can be wearing two Wards and
   * offering one of them is a different sentence from offering both, so the
   * check below is "has she got at least this MANY of each", not `includes`.
   */
  trade(a, aIds, b, bIds) {
    const A = aIds == null ? [] : [].concat(aIds).filter(Boolean);
    const B = bIds == null ? [] : [].concat(bIds).filter(Boolean);
    if (!A.length && !B.length) return false;

    /** Has `p` really got every id in `list`, counting copies? */
    const owns = (p, list) => {
      const left = [...p.powerOrbs];
      for (const id of list) {
        const at = left.indexOf(id);
        if (at < 0) return false;
        left.splice(at, 1);
      }
      return true;
    };
    if (!owns(a, A) || !owns(b, B)) return false;

    const aAfter = a.powerOrbs.length - A.length + B.length;
    const bAfter = b.powerOrbs.length - B.length + A.length;
    if (aAfter > MAX_EQUIPPED || bAfter > MAX_EQUIPPED) return false;

    /* BOTH SIDES EMPTY OUT BEFORE EITHER FILLS UP. Interleaving the loops
       would reintroduce the overflow this function exists to prevent, one
       pile deep instead of one orb deep. */
    for (const id of A) this.take(a, id);
    for (const id of B) this.take(b, id);
    for (const id of B) this.give(a, id, { quiet: true });
    for (const id of A) this.give(b, id, { quiet: true });

    this.game.sfx('trade');
    return true;
  }

  /* -------------------------------- frame -------------------------------- */

  update(dt) {
    if (!this.awakened) return;

    for (const pk of this.pickups) {
      if (pk.taken) continue;
      pk.update(dt);
      for (const p of this.game.players) {
        if (p.position.distanceTo(pk.position) > PICKUP_RADIUS) continue;
        /* A FULL KITTEN LEAVES IT WHERE IT IS AND IS TOLD WHY. Deleting the
           pickup would destroy one of twenty-six orbs in the world because she
           happened to walk over it; doing nothing at all reads as a broken
           collectible. Rate-limited, or standing on one is forty toasts a
           second — the same rule the locked stars follow. */
        if (p.powerOrbs.length >= MAX_EQUIPPED) {
          if ((this._fullT ?? 0) <= 0) {
            this._fullT = 3;
            this.game.toast(
              `${p.name} is carrying ${MAX_EQUIPPED} — drop one at the stall first`, p.index
            );
          }
          continue;
        }
        this.give(p, pk.id);
        pk.taken = true;
        this.scene.remove(pk.group);
        break;
      }
    }
    this._fullT = Math.max(0, (this._fullT ?? 0) - dt);

    this.stall?.update(dt, this.game.players);
    this.stall?.setStock(this.stock);
  }

  faceCamera(camera) {
    if (!this.awakened) return;
    for (const pk of this.pickups) if (!pk.taken) pk.faceCamera(camera);
    this.stall?.faceCamera(camera);
  }

  /** Could this kitten open the stall right now? */
  canShop(player) {
    if (!this.stall || player.mount || player.rideAlong) return false;
    return player.position.distanceTo(this.stall.position) < this.stall.radius;
  }

  /** Reset to the state before 100% — used by Game.restart. */
  clear() {
    for (const pk of this.pickups) this.scene.remove(pk.group);
    this.pickups = [];
    if (this.stall) this.scene.remove(this.stall.group);
    this.stall = null;
    this.forParty(this.game.partySize ?? 2, { restock: true });
    this.awakened = false;
  }


  /**
   * Put one orb back into the world at a spot — a player leaving the game.
   *
   * The dealer's own rule: a sold orb goes back on the shelf, so the party
   * cannot destroy the supply between them. Only a fixed number of these exist,
   * and a kitten walking out of the game with eight of them would delete a
   * chunk of the endgame for everybody still playing.
   *
   * @param spread which orb of the drop this is, 0-based. Non-zero fans it off
   *        `at` — see `DROP_R0`. `findOpenSpot` runs on the FANNED point, not
   *        on her feet, so an orb that lands in a wall still walks itself out
   *        and the fan is not silently undone by the search.
   */
  dropInWorld(id, at, spread = 0) {
    const spec = ORB_BY_ID[id];
    if (!spec || !this.awakened) return null;
    let wx = at.x;
    let wz = at.z;
    if (spread > 0) {
      /* GOLDEN-ANGLE-ISH: a whole turn over eight, plus a wobble. Eight is
         MAX_EQUIPPED, so a full neck comes out as a ring and anything less as
         an arc of one. */
      const a = (spread / MAX_EQUIPPED) * Math.PI * 2 + Math.random() * DROP_ASPIN;
      const r = DROP_R0 + spread * DROP_RSTEP + Math.random() * DROP_RJIT;
      wx += Math.cos(a) * r;
      wz += Math.sin(a) * r;
    }
    const spot = this.world.findOpenSpot(wx, wz, DROP_CLEAR) ?? { x: wx, z: wz };
    const g = this.world.heightAt(spot.x, spot.z);
    if (!g) return null;
    const pk = new PowerOrbPickup(spec, spot.x, g.y, spot.z);
    this.scene.add(pk.group);
    this.pickups.push(pk);
    return pk;
  }
}

/** One worn orb per id, rebuilt whenever the list changes. Used by Game. */
export function buildWornOrbs(ids) {
  return ids.map((id, i) => new PowerOrb(ORB_BY_ID[id], i, ids.length));
}

export { MAX_EQUIPPED, POWER_ORBS, ORB_BY_ID, ORB_IDS, WORLD_ORB_IDS };
