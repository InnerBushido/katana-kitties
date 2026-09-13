import {
  POWER_ORBS, ORB_BY_ID, ORB_IDS, WORLD_ORB_IDS, MAX_EQUIPPED,
  PowerOrb, PowerOrbPickup,
  orbPrice, orbSellPrice, orbPriceFor, orbSellPriceFor, stockFor,
} from '../entities/powerorb.js';
import { KotodamaStall } from '../entities/stall.js';
import { STEAL } from '../entities/clanpower.js';

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

    /**
     * Orbs that changed paws in a fight and are owed back. `[{id, owner}]`.
     *
     * 盗 STEAL MISCHIEF IS A LOAN, NOT A TRANSFER, and this list is the whole
     * of that promise: "the orb is returned to the original player after the
     * fight". Fourth non-negotiable — nothing is lost — so it survives the orb
     * being stolen, dropped, picked up by a third kitten, stolen off HER, and
     * left lying on the deck when the last round ends. `settleLoans` walks it
     * once, at the end of the match, and every one of those endings is the
     * same two questions: where is it now, and who does it belong to.
     *
     * IT IS NOT A TRADE AND MUST NOT LOOK LIKE ONE. The dealer's screen, the
     * profile and the trade window all ask `player.powerOrbs` — a borrowed orb
     * really is hers for the length of the fight, she really can use it, and
     * the shop really will let her sell it. That last one is the hole this
     * closes at settle time rather than by making the orb magic: if it has
     * been sold, `settleLoans` buys it back off the shelf for its owner.
     */
    this.loans = [];

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

  /* --------------------------------- drop -------------------------------- */

  /**
   * Take a pile off her and put it back on the ground around her feet.
   *
   * ASKED FOR AS "a button they can select to drop the currently selected
   * orbs — it will randomly drop them around the player, like it does when a
   * player drops out of the game". It IS that path: the same fan, the same
   * `findOpenSpot`, the same pickups. What is different is that she is still
   * standing there, and the two consequences of that are the whole function.
   *
   * IT IS NOW THE *ONLY* PATH. Dropping out does not put a kitten's orbs on
   * the ground any more — she keeps them and gets them back when she returns —
   * so every orb that ends up lying in the town got there because somebody
   * chose to put it there, through here, having been asked. Both callers are
   * a button: the Character Profile's drop pile, and the pause menu's DROP HER
   * ORBS row beside her DROP OUT.
   *
   * IT PUTS EACH ONE DOWN BEFORE IT TAKES IT OFF HER, one at a time. There are
   * twenty-six of these in the world and `dropInWorld` can decline — the
   * Kotodama are not awakened, or `heightAt` has nothing under the fanned
   * point — so removing first and dropping second would delete an orb on the
   * one code path where the drop fails. Fourth non-negotiable: nothing is
   * lost. It also means a partial drop is a real answer, and the count comes
   * back so the caller can say so instead of claiming all eight landed.
   *
   * THE FAN STARTS AT ONE, NOT AT ZERO. `spread: 0` means "exactly at `at`",
   * which is eight orbs under her own feet; starting at 1 puts the whole pile
   * in the ring at `DROP_R0` and outwards, which is what "around the player"
   * means when the player is standing there. Zero was right for the one caller
   * that no longer exists — `_leavePlayer`, dropping for a kitten who had
   * already been taken out of the game — and every caller left is a button
   * pressed by somebody who is still on the spot.
   *
   * AND THE ORBS ARE SHY OF HER UNTIL SHE STEPS OFF THEM. `DROP_R0` is 2.6 and
   * `PICKUP_RADIUS` is 2.8, so every orb she drops lands INSIDE her own pickup
   * circle: without this the button would hand them all straight back on the
   * first frame the world ran again, and read as doing nothing at all. Widening
   * the ring instead would have thrown her orbs further than a leaver's, for a
   * reason that is about a collision radius rather than about the game. `shyOf`
   * clears itself the moment she is out of range — see `update` — so the drop
   * is take-backable by walking away and coming back, which is the right
   * amount of permanent for a button a nine-year-old presses.
   *
   * @param {object} player
   * @param {string|string[]} ids  what to drop; copies are counted, not deduped
   * @returns {number} how many actually reached the ground
   */
  drop(player, ids) {
    const list = ids == null ? [] : [].concat(ids).filter(Boolean);
    if (!player || !list.length) return 0;
    let n = 0;
    for (const id of list) {
      if (!player.powerOrbs.includes(id)) continue;
      const pk = this.dropInWorld(id, player.position, n + 1);
      if (!pk) continue;
      pk.shyOf = player;
      this.take(player, id);
      n += 1;
    }
    if (n) this.game.sfx('orb');
    return n;
  }

  /* ------------------------------ 盗 stealing ----------------------------- */

  /**
   * Knock one Kotodama off somebody, into the ring.
   *
   * Called from `Game._clanStealHit` — the strike gate — which is the only
   * place that knows a marked hit actually landed. Nothing in here asks whether
   * the two of them were allowed to fight: that question was answered before
   * the hit was, by the one gate that owns it.
   *
   * RANDOM, AND THAT IS THE DESIGN. Richard offered "a random (or selected)"
   * orb; random is the one that keeps the move a piece of mischief instead of a
   * surgical strike. A thief who could name the orb would take the 守 every
   * time and the answer to Steal Mischief would be "do not wear your good one",
   * which is a worse game than "she got my Flash Step, get it back".
   *
   * IT LANDS BESIDE HER, NOT UNDER THE THIEF. Thrown a short way along the line
   * between them (`STEAL.toss`) so it reads as knocked OUT of her rather than
   * pulled towards him — and so it is in the open ground between the two of
   * them, which is where the scrap over it happens.
   *
   * @returns {?object} the orb spec that came off, or null if nothing did
   */
  knockLoose(thief, victim) {
    if (!victim?.powerOrbs?.length) return null;
    /* THE ORB IS PUT DOWN BEFORE IT IS TAKEN OFF HER — the same ordering
       `drop` keeps and for the same reason: `dropAt` is the one step here that
       can decline, and taking first would delete one of twenty-six orbs in the
       world on exactly that path. */
    const id = victim.powerOrbs[Math.floor(Math.random() * victim.powerOrbs.length)];
    const pk = this.dropAt(id, victim.position, thief?.position);
    if (!pk) return null;
    this.take(victim, id);

    /* WHOSE IT REALLY IS. Recorded against the kitten it came off, not against
       the thief — and only once per orb, so an orb stolen, stolen back and
       stolen again still goes home to the girl who bought it. */
    const owner = this._loanOwner(victim, id);
    this.loans.push({ id, owner });

    this.game.sfx('orb');
    return ORB_BY_ID[id] ?? null;
  }

  /**
   * Who a newly stolen orb belongs to.
   *
   * IF THE VICTIM WAS HERSELF BORROWING IT, the owner is whoever she borrowed
   * it from. Two thefts of the same orb in one match otherwise produce two
   * loans, and settling them in order would hand it to the middle kitten. The
   * older loan is retired here, because there is only ever one answer to "whose
   * is this" and this is it.
   */
  _loanOwner(victim, id) {
    const at = this.loans.findIndex((l) => l.id === id && l.owner !== victim);
    if (at < 0) return victim;
    const [old] = this.loans.splice(at, 1);
    return old.owner;
  }

  /**
   * Put an orb down at an exact spot — the ring, mid-fight.
   *
   * NOT `dropInWorld`, AND THE DIFFERENCE IS THE ARENA. That one fans the orb
   * out, runs `findOpenSpot` over open ground and then asks `heightAt` with no
   * height hint at all — which on a deck floating in the sky answers with the
   * ISLAND UNDERNEATH IT, and posts the stolen Kotodama a hundred units below
   * the fight where nobody can ever reach it. Here the height hint is the
   * kitten it came off, and a deck with nothing under it falls back to her own
   * feet rather than refusing.
   *
   * @param {?{x:number,z:number}} from  who knocked it loose; the orb is thrown
   *        AWAY from them. Null drops it straight down.
   */
  dropAt(id, at, from = null) {
    const spec = ORB_BY_ID[id];
    if (!spec || !at) return null;
    let x = at.x;
    let z = at.z;
    if (from) {
      const dx = at.x - from.x;
      const dz = at.z - from.z;
      const len = Math.hypot(dx, dz);
      /* TWO KITTENS IN THE SAME SPOT GIVE A ZERO-LENGTH VECTOR, which
         normalises to NaN and posts the orb to the origin — the same fallback
         `Player.hurt` needs for the same reason, and in a game where they are
         trying to hit each other it is not a hypothetical. */
      if (len > 0.001) {
        x += (dx / len) * STEAL.toss;
        z += (dz / len) * STEAL.toss;
      }
    }
    const g = this.world.heightAt(x, z, at.y);
    const pk = new PowerOrbPickup(spec, x, g ? g.y : at.y, z);
    /* NOBODY MAY TOUCH IT FOR FOUR SECONDS, thief included. Asked for as "make
       it that it can't be picked up for 3-5 secs after it is knocked out to
       force players to battle for it" — without it the thief walks through his
       own steal on the next frame and the orb never touches the deck. */
    pk.lockT = STEAL.lock;
    this.scene.add(pk.group);
    this.pickups.push(pk);
    return pk;
  }

  /**
   * The fight is over: every borrowed orb goes home.
   *
   * FOUR PLACES IT CAN BE, and all four are the same two questions — where is
   * it, and has its owner got room. Lying on the deck, worn by the thief, worn
   * by a third kitten who picked it up off the floor, or sold to the dealer
   * while the round was still running.
   *
   * A FULL OWNER GETS IT AT HER FEET rather than losing it. `give` refuses at
   * eight and it has to: silently dropping the ninth is how a girl ends a
   * tournament with less than she walked into it with. So it is dropped in the
   * world beside her — visible, hers to pick up, and nothing is lost.
   *
   * IDEMPOTENT, because two callers end a match (`Tournament._finishTournament`
   * and `finish`, which also fires on restart and on going home) and a list
   * that had already been settled must not settle again.
   */
  settleLoans() {
    const back = [];
    for (const { id, owner } of this.loans) {
      if (!owner || !this.game.players.includes(owner)) continue;
      /* ON THE DECK FIRST. An orb nobody managed to pick up is the commonest
         ending of all — four seconds of everybody swinging at each other over
         it and then the gong. */
      const loose = this.pickups.find((pk) => !pk.taken && pk.id === id);
      if (loose) {
        loose.taken = true;
        this.scene.remove(loose.group);
      } else {
        const holder = this.game.players.find(
          (q) => q !== owner && q.powerOrbs.includes(id)
        );
        /* SOLD, OR OTHERWISE NOWHERE. The dealer takes returns (`sell` puts it
           back on the shelf), so the orb still exists — it is on the shelf, and
           this takes it off again. Only if the shelf has none either is there
           genuinely nothing to give back, and that cannot happen from a sale. */
        if (holder) this.take(holder, id);
        else if (this.stock[id] > 0) this.stock[id] -= 1;
        else continue;
      }
      if (!this.give(owner, id, { quiet: true })) this.dropInWorld(id, owner.position, 1);
      back.push({ id, owner });
    }
    this.loans = [];
    if (!back.length) return 0;
    this.game.sfx('powerorb');
    for (const who of new Set(back.map((b) => b.owner))) {
      const n = back.filter((b) => b.owner === who).length;
      this.game.toast(
        `${who.name} got ${n === 1 ? 'her Kotodama' : `${n} Kotodama`} back — a steal only lasts the fight`,
        who.index
      );
    }
    return back.length;
  }

  /**
   * She is leaving the game — give back anything she only BORROWED.
   *
   * 盗 STEAL MISCHIEF IS A LOAN AND THIS IS THE ENDING NOBODY HAD WRITTEN.
   * `settleLoans` looks for a borrowed orb in three places: loose on the deck,
   * worn by a live player, or sold back to the dealer. A thief who drops out
   * mid-match used to be covered by accident — leaving tipped her whole neck
   * onto the ground, so the orb turned up as `loose` — and the moment leaving
   * stopped doing that, the orb went into her cast row instead, which is none
   * of the three. Her sister's orb would come back only if that exact kitten
   * were picked up again before the gong. "The orb is returned to the original
   * player after the fight" is a promise, so it is kept here rather than left
   * to a coincidence that has just been removed.
   *
   * AND IT IS THE RIGHT ANSWER ANYWAY, not merely a patch. A steal lasts the
   * fight; walking out of the game is not a way to end the fight still holding
   * it.
   *
   * WHAT SHE IS OWED IS LEFT ALONE. A loan where SHE is the owner — her orb,
   * on somebody else's neck — stays on the list, because she keeps everything
   * now and may well be picked up again before the match ends, and then
   * `settleLoans` finds her in `game.players` and pays her back normally.
   *
   * @returns {number} how many went home
   */
  reclaimFrom(who) {
    if (!who) return 0;
    const keep = [];
    const back = [];
    for (const loan of this.loans) {
      const { id, owner } = loan;
      if (owner === who || !who.powerOrbs.includes(id)) { keep.push(loan); continue; }
      this.take(who, id);
      /* A FULL OWNER GETS IT AT HER FEET, and an owner who has ALSO left gets
         it on the ground where the thief was standing. `give` refuses at eight
         and it has to; silently dropping the ninth is how somebody ends a
         tournament with less than she walked into it with. Fourth
         non-negotiable — there is nowhere in here that an orb ceases to be. */
      const home = owner && this.game.players.includes(owner) ? owner : null;
      if (!home) this.dropInWorld(id, who.position, back.length + 1);
      else if (!this.give(home, id, { quiet: true })) {
        this.dropInWorld(id, home.position, 1);
      }
      back.push({ id, owner: home });
    }
    this.loans = keep;
    if (!back.length) return 0;
    this.game.sfx('powerorb');
    for (const home of new Set(back.map((b) => b.owner))) {
      if (!home) continue;
      const n = back.filter((b) => b.owner === home).length;
      this.game.toast(
        `${home.name} got ${n === 1 ? 'her Kotodama' : `${n} Kotodama`} back`
        + ' — a steal only lasts the fight',
        home.index
      );
    }
    return back.length;
  }

  /* -------------------------------- frame -------------------------------- */

  update(dt) {
    if (!this.awakened) return;

    for (const pk of this.pickups) {
      if (pk.taken) continue;
      pk.update(dt);
      /* STILL TOO HOT TO TOUCH. See `dropAt`: an orb knocked out of somebody
         refuses EVERYBODY for four seconds, which is what turns a steal into a
         scrap over it instead of a transfer. It is still drawn and still bobs —
         a Kotodama that vanished for four seconds would read as lost. */
      if (pk.lockT > 0) {
        pk.lockT -= dt;
        continue;
      }
      for (const p of this.game.players) {
        const near = p.position.distanceTo(pk.position) <= PICKUP_RADIUS;
        /* SHE HAS TO STEP OFF IT FIRST — and only she does. `drop` sets this
           on the orbs a kitten puts down deliberately, because they land at
           2.6 and she picks up at 2.8; without it the drop button hands the
           pile back on the frame the world resumes. It is cleared by walking
           away rather than by a timer, so what she has to do to undo it is the
           obvious thing and there is no window to miss. A SISTER standing next
           to her is not shy of anything and can take them right now, which is
           most of the point of dropping them. */
        if (pk.shyOf === p) {
          if (!near) pk.shyOf = null;
          continue;
        }
        if (!near) continue;
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

  /**
   * Every Powerup Kotodama lying loose in the world, as facts a save can hold.
   *
   * THEY HAVE NO INDEX TO NAME, WHICH IS WHY THIS EXISTS. Everything else a
   * save records about the world is an index into a list the world rebuilds
   * identically from its own seed — prop 47 is prop 47 on every boot. These are
   * not: `spawnPickups` seeds them at 100% and then they MOVE — a steal knocks
   * one onto the arena deck, and a kitten who is tired of carrying hers can put
   * her whole neck on the ground wherever she happens to be standing. So the id
   * and the place are the fact, and there is nothing shorter that is true.
   *
   * AND THAT IS WHAT MAKES A DROPPED ORB SURVIVE THE AFTERNOON. "If orbs are in
   * the level, then when the level is loaded again later, they will still be
   * there" — they are here, with their coordinates, and `setWorldOrbs` puts
   * each one back on the spot it was left on rather than near it.
   *
   * @returns {Array<{id: string, at: number[]}>}
   */
  worldOrbs() {
    return this.pickups
      .filter((pk) => pk && !pk.taken && pk.id)
      .map((pk) => ({
        id: pk.id,
        at: [pk.group.position.x, pk.group.position.y, pk.group.position.z]
          .map((n) => +n.toFixed(2)),
      }));
  }

  /**
   * Put exactly these back in the world, and nothing else.
   *
   * IT CLEARS FIRST, AND THAT IS THE POINT. A load runs `awaken()` to get the
   * stall and the dissolve, and `awaken` re-seeds every orb at its opening
   * spot — on top of every player being handed her worn ones back. Twenty-six
   * orbs became thirty-four, which is the fourth non-negotiable broken in the
   * direction nobody checks for: things APPEARING rather than being lost.
   *
   * NO `lockT` AND NO `shyOf`. Both are about the four seconds after an orb is
   * knocked loose in a live round, and a save being loaded is not in one.
   */
  setWorldOrbs(rows) {
    if (!Array.isArray(rows)) return 0;
    for (const pk of this.pickups) this.scene.remove(pk.group);
    this.pickups = [];
    let n = 0;
    for (const r of rows) {
      const spec = ORB_BY_ID[r?.id];
      if (!spec || !Array.isArray(r.at) || !r.at.every(Number.isFinite)) continue;
      const pk = new PowerOrbPickup(spec, r.at[0], r.at[1], r.at[2]);
      this.scene.add(pk.group);
      this.pickups.push(pk);
      n += 1;
    }
    return n;
  }

  /** Reset to the state before 100% — used by Game.restart. */
  clear() {
    for (const pk of this.pickups) this.scene.remove(pk.group);
    this.pickups = [];
    /* THE LOANS GO WITH THE WORLD THEY WERE MADE IN. This is the restart path:
       every orb is about to be dealt again from scratch, so a promise to give
       one back would be a promise about a kitten who no longer has it, made to
       one who no longer wants it. */
    this.loans = [];
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
