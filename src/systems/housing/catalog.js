/* ---------------------------------------------------------------------------
   CUSTOM HOUSING — what Roshi sells, where it is, and what it costs.

   ONE TABLE PER QUESTION, and nothing here knows how anything is drawn. The
   islands, the houses, the rooms and the furniture are all data, so the
   realtor's card, the editor, the save and `world-check` read the same rows
   and cannot disagree about what a thing is called or what it costs.

   PRICES ARE MULTIPLES OF ONE ORB, never points. Richard, Oct 2026: "8x the
   current price of one kotodama orb" for the small house, 12 for the dojo,
   20 for the castle. The orb's price already follows the size of the world
   and the size of the party (`orbPrice` in entities/powerorb.js), so a home
   priced off it stays the same AMOUNT OF PLAY at two players and at four.
   Deliberately expensive: the point is to make earning matter after 100%
   (the arena, selling orbs, the quests, and the property income below).

   See docs/notes/housing.md for the whole design.
--------------------------------------------------------------------------- */

/** Selling back to Roshi pays this much of what was paid. Richard: "75%". */
export const HOME_SELL = 0.75;

/** The most homes there can be at once — one bridge slot each, four kittens. */
export const MAX_HOMES = 4;

/**
 * The four sky sites.
 *
 * MEASURED, NOT PLACED BY EYE. A probe wound a Snake Way road from the home
 * island to every candidate against the seven roads already in the sky, in
 * this order, and kept the ones whose road came out with no fault at all
 * (grade, a bend too tight, through an island, touching another road). The
 * backdrop FAR_PLACES were tried first: only three of seven could be reached,
 * the west ones blocked by the dojo and bamboo islands and their own roads.
 * Measured 2026-10-12 — lengths 342 / 466 / 391 / 380, all fault-free:
 *
 *   (329, 276)   leaves the rim at  19°     (-164, -451) leaves at -100°
 *   (463, -82)   leaves the rim at -62°     (-420, -200) leaves at -139°
 *
 * Rejected: (-73, 414) and (30, 440) — touch the bamboo/ash roads; (250,
 * -380) and (160, -470) — through the autumn island.
 *
 * THE ORDER IS THE ORDER THE ROADS ARE WOUND IN, and it matters: each road is
 * wound around the ones before it. `world-check` re-winds all four and fails
 * on any fault, so moving a site is safe exactly when the check stays green.
 *
 * FAR ON PURPOSE. "About a minute's walk is fine" — and the dragons fly. The
 * bridge has a 2x strip (`SPEED_STRIP`) for the walk.
 */
export const HOME_SITES = [
  {
    id: 'sunrise', name: 'SUNRISE ISLE', x: 329, z: 276, y: 40, r: 50, seed: 211, biome: 'meadow',
    blurb: 'Morning sun first, a long gentle bridge, and a meadow flat enough for a volleyball court.',
    perks: ['sunrise view', 'big flat meadow', 'shortest bridge'],
  },
  {
    id: 'cloudpeak', name: 'CLOUDPEAK ISLE', x: 463, z: -82, y: 60, r: 50, seed: 223, biome: 'bamboo',
    blurb: 'The highest of the four. Bamboo grows here on its own, and the clouds come right up to the door.',
    perks: ['highest island', 'bamboo grows faster', 'longest bridge'],
  },
  {
    id: 'moonwater', name: 'MOONWATER ISLE', x: -164, z: -451, y: 35, r: 50, seed: 239, biome: 'frost',
    blurb: 'Cool and quiet, with the best fishing water in the sky. The koi here grow rare colours sooner.',
    perks: ['rare koi sooner', 'snowy garden', 'quiet'],
  },
  {
    id: 'emberleaf', name: 'EMBERLEAF ISLE', x: -420, z: -200, y: 45, r: 50, seed: 251, biome: 'autumn',
    blurb: 'Red maples all year round, and a view of the Dojo of the Turning Circle from the porch.',
    perks: ['autumn all year', 'view of the Dojo', 'warm onsen water'],
  },
];
export const SITE_BY_ID = Object.fromEntries(HOME_SITES.map((s) => [s.id, s]));

/**
 * The three houses. Built procedurally from the town's own pieces (see
 * homehouse.js) so they match the town they are a bridge away from.
 *
 * `rooms` are the spaces an owner can turn into something — a living room on
 * the tatami grid, the kendo dojo, the holodeck. The castle has one per
 * possible owner, CLAIMED on the CASTLE ROOMS card, a fair share each
 * (`Housing.claimShare`): the rooms over the owners, rounded down.
 */
export const HOUSES = [
  {
    id: 'minka', name: 'SMALL JAPANESE HOUSE', short: 'SMALL HOUSE', mult: 8, floors: 1, w: 12, d: 10, owners: 1,
    blurb: 'One cosy tatami room with a porch all the way round. Quick to buy and ready to move into.',
    rooms: [{ id: 'main', name: 'TATAMI ROOM', floor: 0, cx: 0, cz: 0, w: 10, d: 8 }],
  },
  {
    id: 'dojohouse', name: 'DOJO HOUSE', short: 'DOJO HOUSE', mult: 12, floors: 2, w: 16, d: 12, owners: 1,
    blurb: 'Two floors: a big polished training hall downstairs and a tatami room upstairs.',
    rooms: [
      { id: 'hall', name: 'TRAINING HALL', floor: 0, cx: 0, cz: 0, w: 14, d: 10, kendo: true },
      { id: 'upper', name: 'UPSTAIRS ROOM', floor: 1, cx: 0, cz: 0, w: 11, d: 8 },
    ],
  },
  {
    id: 'castle', name: 'SKY CASTLE', short: 'SKY CASTLE', mult: 20, floors: 3, w: 22, d: 22, owners: 4,
    blurb: 'Three floors on a stone base, a room for each of up to four owners, and a lookout on top. Share it with your sisters!',
    rooms: [
      { id: 'east', name: 'EAST ROOM', floor: 0, cx: 5, cz: 0, w: 9, d: 18, claim: true },
      { id: 'west', name: 'WEST ROOM', floor: 0, cx: -5, cz: 0, w: 9, d: 18, claim: true, kendo: true },
      { id: 'north', name: 'NORTH ROOM', floor: 1, cx: 0, cz: -3, w: 16, d: 7, claim: true },
      { id: 'south', name: 'SOUTH ROOM', floor: 1, cx: 0, cz: 3.5, w: 16, d: 6, claim: true },
      { id: 'top', name: 'LOOKOUT', floor: 2, cx: 0, cz: 0, w: 11, d: 11 },
    ],
  },
];

/**
 * THE TINY HOUSE — never sold with an island, only ever BUILT on one.
 * Richard, Oct 2026: "If they buy a Small Japanese House, they will get an
 * even smaller 'Tiny' Japanese house they can build for free". So it is not
 * in `HOUSES` (Roshi's list, and every check that walks it), only here.
 */
export const TINY_HOUSE = {
  id: 'tiny', name: 'TINY JAPANESE HOUSE', short: 'TINY HOUSE', mult: 4, floors: 1, w: 8, d: 8, owners: 1, annexOnly: true,
  blurb: 'One little tatami room under a little roof. A hideaway, a guest house, a reading nook.',
  rooms: [{ id: 'main', name: 'TINY ROOM', floor: 0, cx: 0, cz: 0, w: 6, d: 6 }],
};

export const HOUSE_BY_ID = Object.fromEntries([...HOUSES, TINY_HOUSE].map((h) => [h.id, h]));
// every room knows its house, so the editor can keep furniture off its stairs
for (const h of [...HOUSES, TINY_HOUSE]) for (const r of h.rooms) { r.house = h.id; r.hk = 'main'; }

/**
 * MORE HOUSES ON ONE ISLAND. Richard, Oct 2026: "there will be an option in
 * the menu at their house that allows them to buy and place more houses on
 * the island. Each island will come with a free (for the first one built),
 * smaller version house of the one they bought ... In this menu, they can
 * build as many houses on the island as they want, but the first house is
 * free". The island's own house is `H.house` at `H.at`; every other one is a
 * row of `H.annex`: `{ uid, house, x, z, rot, paid, free }`, in the ISLAND's
 * frame — the same frame the yard is in — so moving the main house moves
 * nothing outdoors, and moving any house moves everything inside it.
 */
export const FREE_ANNEX = { castle: 'dojohouse', dojohouse: 'minka', minka: 'tiny' };
/** What can be built as an extra house, smallest first. */
export const BUILDABLE_HOUSES = ['tiny', 'minka', 'dojohouse', 'castle'];

/** Every house on a home, the island's own first: `{ hk, house, x, z, rot, row }`. */
export function houseSpecs(H) {
  const at = H?.at ?? {};
  const out = [{ hk: 'main', house: H.house, x: at.x ?? 0, z: at.z ?? 0, rot: at.rot ?? 0, row: H }];
  for (const a of H?.annex ?? []) {
    if (!HOUSE_BY_ID[a.house]) continue;
    out.push({ hk: `a${a.uid}`, house: a.house, x: a.x, z: a.z, rot: a.rot ?? 0, row: a });
  }
  return out;
}

const _roomsMemo = new WeakMap();

/**
 * EVERY ROOM IN EVERY HOUSE ON A HOME, as one list. The island's own
 * house's rooms are the catalog's own rows, ids unchanged (so every save
 * made before there were two houses still finds its furniture); an extra
 * house's rooms are copies with the id `a<uid>_<room>`, keyed in the same
 * `H.rooms` — which is why nothing that furnishes, claims or sells a room had
 * to learn that there can be more than one house. `hk` says whose frame.
 */
export function homeRooms(H) {
  if (!H) return [];
  const specs = houseSpecs(H);
  const sig = specs.map((s) => s.hk + s.house).join(',');
  const hit = _roomsMemo.get(H);
  if (hit?.sig === sig) return hit.rooms;
  const rooms = [];
  const seen = {};
  for (const s of specs) {
    const def = HOUSE_BY_ID[s.house];
    if (s.hk === 'main') { rooms.push(...def.rooms); continue; }
    seen[s.house] = (seen[s.house] ?? 0) + 1;
    const label = `${def.short}${seen[s.house] > 1 ? ` ${seen[s.house]}` : ''}`;
    for (const r of def.rooms) {
      rooms.push({ ...r, id: `${s.hk}_${r.id}`, name: `${label}: ${r.name}`, hk: s.hk });
    }
  }
  _roomsMemo.set(H, { sig, rooms });
  return rooms;
}

export const roomById = (H, id) => homeRooms(H).find((r) => r.id === id) ?? null;

/**
 * BRIDGES BETWEEN HOUSES. Richard: "a way for houses to be connected together
 * with bridges ... on the 1st, 2nd, or 3rd floor ... connect a 2nd floor to a
 * 3rd floor ... different ramps or steps ... different types of bridges, some
 * more generic and some more elaborate and decorative and fanciful." A link is
 * `{ uid, a: end, b: end, style }` with an end `{ hk, floor, side, at }` — a
 * door cut in that house's wall (side 0 front, 1 +x, 2 back, 3 -x; `at` along
 * it). The bridge is whatever the two doors make it: its angle, its length,
 * and whether it is level, a ramp or a flight of steps.
 * `steps` — the climb is drawn as treads (the walk is still the slope).
 */
export const LINK_STYLES = [
  { id: 'plank', name: 'PLANK BRIDGE', w: 2.6, mult: 0.4, steps: false, blurb: 'Boards and a rope rail. Plain and quick.' },
  { id: 'rope', name: 'ROPE BRIDGE', w: 2.4, mult: 0.5, steps: false, blurb: 'Slats on ropes, with knotted posts — a jungle crossing.' },
  { id: 'stone', name: 'STONE BRIDGE', w: 3.2, mult: 0.9, steps: true, blurb: 'Grey stone with solid parapets and stone steps.' },
  { id: 'vermilion', name: 'VERMILION BRIDGE', w: 3.0, mult: 1.4, steps: true, blurb: 'Red lacquer, brass-capped posts and paper lanterns, like a shrine bridge.' },
  { id: 'sakura', name: 'BLOSSOM BRIDGE', w: 3.4, mult: 2.2, steps: true, blurb: 'The fanciest: an arch of cherry blossom, flower boxes and glowing lanterns.' },
];
export const LINK_BY_ID = Object.fromEntries(LINK_STYLES.map((s) => [s.id, s]));

/**
 * What a ROOM can be turned into. A room is one of these at a time; the
 * living room is the free default and holds furniture on the tatami grid.
 *
 * `need: 'kendo'` — only a room flagged `kendo` (a training floor big enough
 * to fight on) can take the kendo dojo, which is the "valid, theme-matching
 * area" rule for rooms.
 */
export const ROOM_TYPES = [
  { id: 'living', name: 'TATAMI ROOM', mult: 0, blurb: 'Furniture goes on the tatami grid. Free.' },
  /* HALF WHAT THEY WERE (5 and 6). Richard, Oct 2026: "let's lower the price
     of the holodeck and the kendo dojo by half." */
  {
    id: 'kendo', name: 'KENDO DOJO', mult: 2.5, need: 'kendo',
    blurb: 'Bogu armour and a shinai. Sparring is allowed on this floor — and only on this floor.',
  },
  {
    id: 'holodeck', name: 'HOLODECK', mult: 3,
    blurb: 'Three racks of VR gear and your own tube — put them wherever you like, and add up to four tubes for free. Put on all three, step in, and you are in the simulator.',
  },
];
export const ROOM_TYPE_BY_ID = Object.fromEntries(ROOM_TYPES.map((r) => [r.id, r]));

/**
 * Furniture and activities.
 *
 * `where`:  'room' — on the tatami grid indoors
 *           'wall' — hung on a room's OUTER wall (a window, a scroll ...)
 *           'yard' — anywhere outdoors on her island, placed freely in 3D
 * The yard used to be seven fixed plots, each of a kind. Richard, Oct 2026:
 * "Player should be able to place the plots where they want it, we need to
 * make a 3D way of player being able to place things exactly where they want
 * it rather than having predetermined locations for all the plots." So an
 * outdoor thing is `{ uid, id, x, z, rot }` in the house's own frame
 * (homestore.js migrates the old plots), and the only rules are the ones in
 * editor.js `yardFits`: on the island, off the house, off the path to the
 * bridge, and not on top of something else.
 *
 * `deco`  — a DECORATION: cheap, does nothing (or nearly nothing), and sits on
 *           its own shelf in the shop. Richard: "There are a lot of
 *           'decoration' items for the Garden items ... Decorational items
 *           should be cheap and should be listed as decorational items".
 * `cells` — footprint on the tatami grid (1 cell = 2 units) for room items.
 * `r`     — footprint RADIUS outdoors, in units, for collision and spacing.
 * `size`  — how big it is drawn: `{ h }` a height or `{ w }` a width, in
 *           units. A kitten is 2.9 tall. MEASURED ONTO THE MODEL at load
 *           (models.js `fitTo`), never assumed from the file — Polyfork sizes
 *           are real metres and a kitten is not a metre-scale person, which is
 *           why "the Samurai Armor, Taiko Drum, katana stand, etc. should be
 *           twice as big or more ... samurai armor should somewhat fit the
 *           player". The stand-in is fitted to the same number, so a missing
 *           model costs the look and not the size.
 * `model` — a vendored Polyfork GLB in public/models/polyfork/, or null for
 *           one drawn here. EVERY ONE HAS A PROCEDURAL FALLBACK (models.js):
 *           delete the folder and the game still plays.
 * `mult`  — price as a fraction of one orb.
 * `act`   — what pressing INTERACT at it does, if anything.
 * `later` — shown, locked, and not for sale yet (the Bushido-Blade forest).
 */
export const ITEMS = [
  /* ------------------------------------------- the holodeck's own kit
     Richard, Oct 2026: "after building a holodeck, players should be able to
     place the VR Tubes and VR equipment where it fits best in the room ...
     placing the 3 pieces of VR equipment and 1 tube should be mandatory, but
     player can place up to 4. Placing Tubes and equipment should be free since
     they already paid for it." So the kit is FURNITURE on the tatami grid —
     the same build mode, the same `fits` — at no price (`mult: 0`, which
     `itemPrice` reads as free rather than priceOf's floor of 10), and only on
     a holodeck's floor (`where: ['holo']`, a shelf no shop lists). One tube
     and the three racks cannot be taken out (holodeck.js `holoWhyRemove`).
     The rack ids are `holorack_` + the arcade's GEAR_ITEMS ids; the check
     pins that they agree. */
  { id: 'holotube', name: 'VR TUBE', where: ['holo'], cells: [2, 2], mult: 0, model: null, holo: 'tube',
    blurb: 'Step in suited up and press ACTION.' },
  { id: 'holorack_headset', name: 'VR HEADSET RACK', where: ['holo'], cells: [1, 1], mult: 0, model: null, holo: 'rack', gear: 'headset' },
  { id: 'holorack_gloves', name: 'VR GLOVES RACK', where: ['holo'], cells: [1, 1], mult: 0, model: null, holo: 'rack', gear: 'gloves' },
  { id: 'holorack_suit', name: 'TRACKING SUIT RACK', where: ['holo'], cells: [1, 1], mult: 0, model: null, holo: 'rack', gear: 'suit' },
  // ---------------------------------------------------------------- indoors
  { id: 'andon', name: 'PAPER FLOOR LAMP', where: ['room'], cells: [1, 1], size: { h: 2.2 }, mult: 0.15, model: 'andon-floor-lantern-b1b7ea', deco: true },
  { id: 'futon', name: 'FUTON', where: ['room'], cells: [2, 3], size: { w: 5.4 }, mult: 0.25, model: null, act: 'nap',
    blurb: 'Lie down for a nap. Wakes you fully rested.' },
  { id: 'kotatsu', name: 'KOTATSU TABLE', where: ['room'], cells: [2, 2], size: { w: 3.6 }, mult: 0.4, model: null, act: 'sit',
    blurb: 'Sit round it together — eat a meal here, or play a game of cups.' },
  { id: 'tansu', name: 'TANSU CHEST', where: ['room'], cells: [1, 1], size: { h: 2.6 }, mult: 0.3, model: null, act: 'chest' },
  { id: 'yoroi', name: 'SAMURAI ARMOUR', where: ['room'], cells: [1, 1], size: { h: 2.7 }, mult: 0.6, model: 'yoroi-armour-stand-25f9a2', deco: true },
  { id: 'katana', name: 'KATANA ON A STAND', where: ['room'], cells: [1, 1], size: { h: 1.7 }, mult: 0.35, model: 'katana-in-scabbard-4b6ffb', deco: true },
  { id: 'drum', name: 'TAIKO DRUM', where: ['room', 'yard'], cells: [2, 2], r: 1.8, size: { h: 3.0 }, mult: 0.45, model: 'war-drum-on-stand-cbb91a', act: 'drum',
    blurb: 'Play along to the beat — a rhythm game for one.' },
  { id: 'bucket', name: 'WOODEN BUCKET', where: ['room', 'yard'], cells: [1, 1], r: 0.8, size: { h: 1.1 }, mult: 0.05, model: 'wooden-teoke-bucket-e65f35', deco: true },
  { id: 'sake', name: 'BIG BARREL', where: ['room', 'yard'], cells: [1, 1], r: 1.1, size: { h: 1.7 }, mult: 0.08, model: 'komodaru-sake-barrel-c5199a', deco: true },
  { id: 'kitchen', name: 'KITCHEN', where: ['room'], cells: [2, 1], size: { w: 4.0 }, mult: 0.8, model: null, act: 'cook',
    blurb: 'Cook a meal, carry it to the kotatsu, and eat together for extra health in your next battle.' },
  // ------------------------------------------------------------------ walls
  /* ON THE WALLS. Richard: "Is it possible to add some sort of windows in the
     houses? ... We can make this a furniture that can be placed on the walls.
     We should have some furniture that can be placed on walls, like pictures
     or scrolls, trophies that players win at the arena". A wall thing takes
     one 2-unit span of a room's OUTER wall (`wallSlots` in editor.js). */
  { id: 'window', name: 'SHOJI WINDOW', where: ['wall'], size: { w: 2.0 }, mult: 0.2, model: null, act: 'look',
    blurb: 'A paper window that slides open. LOOK OUT and see your island.' },
  { id: 'scroll', name: 'HANGING SCROLL', where: ['wall'], size: { w: 1.1 }, mult: 0.1, model: null, deco: true,
    blurb: 'A kakejiku with a brushed word on it.' },
  { id: 'picture', name: 'FRAMED PICTURE', where: ['wall'], size: { w: 1.8 }, mult: 0.1, model: null, deco: true,
    blurb: 'A picture of your clan emblem, or the sea if you have not sworn yet.' },
  { id: 'trophy', name: 'TROPHY SHELF', where: ['wall'], size: { w: 2.0 }, mult: 0.15, model: null, act: 'trophies',
    blurb: 'A shelf with one golden cup for every arena battle you have won.' },
  // --------------------------------------------- outdoors: things that DO something
  /* `hit` is what it COLLIDES at, smaller than the `r` it is drawn at. Richard,
     Oct 2026: "Unable to build a Koi Pond in the Castle island, it says there
     is not enough room, but seems there is plenty of room. Maybe we need to
     make the collision detection for the Koi pond less big". The water ends at
     r - 1.3; the stone rim beyond it may kiss a neighbour. */
  { id: 'koipond', name: 'KOI POND', where: ['yard'], r: 12, hit: 10.5, mult: 2, model: null, act: 'koi',
    blurb: 'Feed the koi so they grow — and rare colours turn up. Pick up the rod beside it and FISH!' },
  { id: 'onsen', name: 'ONSEN HOT SPRING', where: ['yard'], r: 7, mult: 2.5, model: null, act: 'soak',
    blurb: 'Change into a bathing suit and relax. Your first 15 seconds of every round next battle hit twice as hard.' },
  { id: 'volleyball', name: 'VOLLEYBALL COURT', where: ['yard'], r: 10, mult: 1.5, model: null, act: 'volley',
    blurb: 'A sand court and a net. Bat the ball over with your katana.' },
  { id: 'bamboofarm', name: 'BAMBOO FARM', where: ['yard'], r: 7, mult: 1.5, model: null, act: 'harvest',
    blurb: 'Bamboo that grows back in REAL time — harvest it and sell it to Roshi.' },
  { id: 'pen', name: 'ANIMAL PEN', where: ['yard'], r: 9, mult: 2, model: null, act: 'animals',
    blurb: 'Raise animals in real time. Feed them, clean up after them, walk them and PLAY with them.' },
  { id: 'treehouse', name: 'TREEHOUSE', where: ['yard'], r: 11, mult: 1.8, model: null,
    blurb: 'Four trees, branches and rope bridges, and a little house at the top. Climb all the way up!' },
  { id: 'shrine', name: 'LITTLE SHRINE', where: ['yard'], r: 4.5, size: { h: 8 }, mult: 1.2, model: 'tiered-pagoda-f4ade0', act: 'pray',
    blurb: 'Pray here before a battle and you are BLESSED: fall out of the ring and you fly instead.' },
  { id: 'belltower', name: 'BELL TOWER', where: ['yard'], r: 3.5, size: { h: 7.5 }, mult: 0.6, model: 'temple-bell-tower-745387', act: 'bell',
    blurb: 'A temple bell. Ring it!' },
  // --------------------------------------------- outdoors: decorations
  { id: 'stones', name: 'JUMPING STONES', where: ['yard'], r: 5, mult: 0.12, model: null, deco: true },
  { id: 'toriigarden', name: 'TORII GARDEN', where: ['yard'], r: 5.5, mult: 0.2, model: null, deco: true },
  { id: 'well', name: 'ROOFED WELL', where: ['yard'], r: 2.4, size: { h: 4.4 }, mult: 0.15, model: 'roofed-well-43a2fc', deco: true },
  { id: 'waterwheel', name: 'WATER WHEEL', where: ['yard'], r: 3, size: { h: 5.2 }, mult: 0.15, model: 'stream-water-wheel-ea2d68', deco: true },
  { id: 'teahouse', name: 'TEAHOUSE', where: ['yard'], r: 4.5, size: { h: 6 }, mult: 0.3, model: 'open-front-teahouse-c7dd18', deco: true },
  { id: 'basin', name: 'STONE BASIN', where: ['yard'], r: 1.2, size: { h: 1.3 }, mult: 0.06, model: 'tsukubai-stone-basin-677586', deco: true },
  { id: 'lantern', name: 'STONE LANTERN', where: ['yard'], r: 1.1, size: { h: 3.0 }, mult: 0.05, model: 'stone-lantern-d56d0a', deco: true },
  { id: 'maple', name: 'MAPLE TREE', where: ['yard'], r: 1.6, size: { h: 8 }, mult: 0.08, model: 'japanese-maple-d2fb29', deco: true },
  { id: 'cherry', name: 'CHERRY TREE', where: ['yard'], r: 1.8, size: { h: 9 }, mult: 0.1, model: 'cherry-tree-a710a9', deco: true },
  { id: 'pine', name: 'SCULPTED PINE', where: ['yard'], r: 1.6, size: { h: 6 }, mult: 0.08, model: 'sculpted-pine-e45d4f', deco: true },
  { id: 'azalea', name: 'AZALEA BUSH', where: ['yard'], r: 1.1, size: { h: 1.6 }, mult: 0.03, model: 'azalea-bush-7bb14d', deco: true },
  { id: 'fence', name: 'BAMBOO FENCE', where: ['yard'], r: 2.2, size: { w: 4.4 }, mult: 0.03, model: 'takegaki-bamboo-fence-c6718b', deco: true },
  { id: 'firebasket', name: 'FIRE BASKET', where: ['yard'], r: 1, size: { h: 3.2 }, mult: 0.05, model: 'kagaribi-fire-basket-d28c11', deco: true },
  { id: 'bench', name: 'TEAHOUSE BENCH', where: ['yard'], r: 1.6, size: { w: 3.2 }, mult: 0.04, model: 'teahouse-bench-6b34e1', deco: true },
  { id: 'banner', name: 'NOBORI BANNER', where: ['yard'], r: 0.9, size: { h: 5.5 }, mult: 0.03, model: 'nobori-banner-ae4d88', deco: true },
  { id: 'paddy', name: 'RICE PADDY', where: ['yard'], r: 3, size: { w: 5.5 }, mult: 0.1, model: 'rice-paddy-tile-dc727e', deco: true },
  { id: 'reeds', name: 'REEDS', where: ['yard'], r: 0.9, size: { h: 2.4 }, mult: 0.02, model: 'moat-reed-clump-dd6b60', deco: true },
  /* WALKING PATHS. Richard: "allow players to build walking paths in the yard
     on the ground, these can be narrow or wide. Some of it should be fancy like
     'red carpet' paths ... Can even do some with tiki torches". A piece is
     `len` long and `pw` wide, laid flat on the grass; pieces may touch and
     cross each other, and nothing stands in the way of walking on one.
     `r` is only the ghost's ring. Paths sit on their own shelf (`path`). */
  { id: 'path_stone', name: 'STEPPING STONES (NARROW)', where: ['yard'], path: true, deco: true, len: 6, pw: 2, r: 3, mult: 0.02, model: null },
  { id: 'path_wood', name: 'BOARDWALK (NARROW)', where: ['yard'], path: true, deco: true, len: 6, pw: 2.4, r: 3, mult: 0.03, model: null },
  { id: 'path_gravel', name: 'RAKED GRAVEL PATH', where: ['yard'], path: true, deco: true, len: 6, pw: 3, r: 3, mult: 0.02, model: null },
  { id: 'path_flag', name: 'FLAGSTONE PATH (WIDE)', where: ['yard'], path: true, deco: true, len: 6, pw: 4.4, r: 3.2, mult: 0.04, model: null },
  { id: 'path_petal', name: 'SAKURA PETAL PATH', where: ['yard'], path: true, deco: true, len: 6, pw: 2.8, r: 3, mult: 0.05, model: null },
  { id: 'path_lantern', name: 'LANTERN PATH', where: ['yard'], path: true, deco: true, len: 6, pw: 3.6, r: 3.2, mult: 0.08, model: null },
  { id: 'path_carpet', name: 'RED CARPET', where: ['yard'], path: true, deco: true, len: 6, pw: 3, r: 3, mult: 0.1, model: null,
    blurb: 'For VIP kittens only. Gold trim and all.' },
  { id: 'path_tiki', name: 'TIKI TORCH PATH', where: ['yard'], path: true, deco: true, len: 6, pw: 3.6, r: 3.2, mult: 0.1, model: null,
    blurb: 'Bamboo torches burning on both sides.' },
  {
    id: 'bladeforest', name: 'BUSHIDO BAMBOO FOREST', where: ['yard'], r: 10, mult: 4, model: null, later: true,
    blurb: 'Coming later: a sparring forest where a clean cut goes straight through the bamboo.',
  },
];
export const ITEM_BY_ID = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

/**
 * Starter layouts for "buy and go". Picking a preset at Roshi's counter
 * furnishes the house in one step at a discount on buying the pieces one at
 * a time; everything in it can be moved or sold back afterwards.
 */
export const PRESETS = [
  {
    id: 'cosy', name: 'COSY', mult: 1.2, blurb: 'A futon, a kotatsu, lamps, a koi pond and a cherry tree.',
    room: ['futon', 'kotatsu', 'andon', 'andon', 'tansu'],
    yard: ['koipond', 'cherry', 'lantern', 'bench'],
  },
  {
    id: 'farm', name: 'FARMSTEAD', mult: 3.2, blurb: 'A bamboo farm, an animal pen, a kitchen and a well — built to earn.',
    room: ['futon', 'kitchen', 'tansu', 'bucket'],
    yard: ['bamboofarm', 'pen', 'well', 'paddy'],
  },
  {
    id: 'warrior', name: 'WARRIOR', mult: 2.4, blurb: 'Armour, a katana stand, a taiko drum, an onsen and a bell tower.',
    room: ['yoroi', 'katana', 'drum', 'andon'],
    yard: ['onsen', 'belltower', 'firebasket', 'banner'],
  },
];
export const PRESET_BY_ID = Object.fromEntries(PRESETS.map((p) => [p.id, p]));

/** Price of a thing in points, given the price of one orb today. Rounded to
 *  a ten because a kid reads "6,500" and does not read "6,487". */
export function priceOf(mult, orbPrice) {
  return Math.max(10, Math.round((mult * orbPrice) / 10) * 10);
}

/** The 2x strip on each bridge: from this fraction of the road to that. */
export const SPEED_STRIP = { from: 0.12, to: 0.88, mult: 2 };
