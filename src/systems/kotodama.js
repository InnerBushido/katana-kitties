import {
  POWER_ORBS, ORB_BY_ID, ORB_IDS, MAX_EQUIPPED, PowerOrb, PowerOrbPickup,
  orbPrice, orbSellPrice, stockFor,
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
 * How many lie in the world: EXACTLY ONE OF EACH, and no duplicates.
 *
 * The first version scattered sixteen — one of each plus eight spares — so a
 * stack could be built on foot. That was the wrong call and it is worth saying
 * why, because it looked like the generous one. Sixteen orbs lying about means
 * two girls can wander into a full set of eight each without ever speaking to
 * each other, and this whole feature exists so that they do: the interesting
 * object in it is not the orb, it is the sentence "I'll swap you my Ward".
 *
 * Eight means every power is FINDABLE — nothing is locked behind a price a
 * kid might never reach — and nothing is stackable by walking. A second Gale
 * has to be bought, sold for, or traded out of her sister's hand. That is the
 * pressure the dealer's brutal prices are for, and it is why he stocks four of
 * the four stat orbs (see `stockFor`) while the world stocks one.
 */
const WORLD_SPAWN = ORB_IDS.length;

/** How close you have to be to walk one up. */
const PICKUP_RADIUS = 2.8;

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

    /** What the dealer has left. Four of each stat orb, one of each move —
     *  see `stockFor`, which owns that split and the reasoning for it. */
    this.stock = Object.fromEntries(ORB_IDS.map((id) => [id, stockFor(id)]));

    this.price = orbPrice(this.world.pointsTotal);
    this.sellPrice = orbSellPrice(this.world.pointsTotal);
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
    const prizes = winners.map((p) => {
      const spec = POWER_ORBS[(Math.random() * POWER_ORBS.length) | 0];
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

    /* One of each, in roster order. Not shuffled and not random: random would
       give you three Gale orbs and no Ward often enough that a nine-year-old
       reads it as the game cheating, and the guarantee that every power is
       findable on foot is the reason the shop's prices are allowed to be
       brutal. Which ISLAND each lands on is decided below by index, so the
       eight are spread rather than piled. */
    const order = ORB_IDS.slice(0, WORLD_SPAWN);

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

  /** Why a purchase would fail, or null if it would go through. */
  buyRefusal(player, id) {
    if (!(this.stock[id] > 0)) return 'The dealer has none left.';
    if (player.powerOrbs.length >= MAX_EQUIPPED) return `${player.name} can only wear ${MAX_EQUIPPED}.`;
    if (player.score < this.price) return `${this.price - player.score} more points needed.`;
    return null;
  }

  buy(player, id) {
    if (this.buyRefusal(player, id)) return false;
    player.score -= this.price;
    this.stock[id]--;
    this.give(player, id, { quiet: true });
    this.game.sfx('coin');
    this.game.onScoreChanged(player);
    this.game.toast(`${player.name} bought ${ORB_BY_ID[id].name} for ${this.price}`, player.index);
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
    if (!this.take(player, id)) return false;
    player.score += this.sellPrice;
    this.stock[id] = (this.stock[id] ?? 0) + 1;
    this.game.sfx('coin');
    this.game.onScoreChanged(player);
    this.game.toast(`${player.name} sold ${ORB_BY_ID[id].name} for ${this.sellPrice}`, player.index);
    return true;
  }

  /* -------------------------------- trade -------------------------------- */

  /**
   * Swap one orb for one orb, both ways at once.
   *
   * IT IS ATOMIC AND IT IS CHECKED BEFORE ANYTHING MOVES. Both kittens are at
   * eight slots more often than not by the time they are trading, so a naive
   * "give hers to him, give his to her" overflows on the first half and leaves
   * one girl a copy down with nothing to show for it. Removing both first is
   * what makes the count conserved, and `world-check` asserts exactly that:
   * a trade cannot create or destroy an orb.
   *
   * Either side may offer nothing (`null`) — a gift. That is not a
   * simplification for its own sake: the older sister giving the younger one a
   * spare is the single most likely thing to happen at this screen.
   */
  trade(a, aId, b, bId) {
    if (aId && !a.powerOrbs.includes(aId)) return false;
    if (bId && !b.powerOrbs.includes(bId)) return false;
    if (!aId && !bId) return false;

    const aAfter = a.powerOrbs.length - (aId ? 1 : 0) + (bId ? 1 : 0);
    const bAfter = b.powerOrbs.length - (bId ? 1 : 0) + (aId ? 1 : 0);
    if (aAfter > MAX_EQUIPPED || bAfter > MAX_EQUIPPED) return false;

    if (aId) this.take(a, aId);
    if (bId) this.take(b, bId);
    if (bId) this.give(a, bId, { quiet: true });
    if (aId) this.give(b, aId, { quiet: true });

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
    this.stock = Object.fromEntries(ORB_IDS.map((id) => [id, stockFor(id)]));
    this.awakened = false;
  }
}

/** One worn orb per id, rebuilt whenever the list changes. Used by Game. */
export function buildWornOrbs(ids) {
  return ids.map((id, i) => new PowerOrb(ORB_BY_ID[id], i, ids.length));
}

export { MAX_EQUIPPED, POWER_ORBS, ORB_BY_ID, ORB_IDS };
