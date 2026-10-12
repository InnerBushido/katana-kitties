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
 * possible owner, CLAIMED by whoever walks in first ("rooms are claimed by
 * whoever walks in first and claims it").
 */
export const HOUSES = [
  {
    id: 'minka', name: 'SMALL JAPANESE HOUSE', mult: 8, floors: 1, w: 12, d: 10, owners: 1,
    blurb: 'One cosy tatami room with a porch all the way round. Quick to buy and ready to move into.',
    rooms: [{ id: 'main', name: 'TATAMI ROOM', floor: 0, cx: 0, cz: 0, w: 10, d: 8 }],
  },
  {
    id: 'dojohouse', name: 'DOJO HOUSE', mult: 12, floors: 2, w: 16, d: 12, owners: 1,
    blurb: 'Two floors: a big polished training hall downstairs and a tatami room upstairs.',
    rooms: [
      { id: 'hall', name: 'TRAINING HALL', floor: 0, cx: 0, cz: 0, w: 14, d: 10, kendo: true },
      { id: 'upper', name: 'UPSTAIRS ROOM', floor: 1, cx: 0, cz: 0, w: 11, d: 8 },
    ],
  },
  {
    id: 'castle', name: 'SKY CASTLE', mult: 20, floors: 3, w: 22, d: 22, owners: 4,
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
export const HOUSE_BY_ID = Object.fromEntries(HOUSES.map((h) => [h.id, h]));

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
  {
    id: 'kendo', name: 'KENDO DOJO', mult: 5, need: 'kendo',
    blurb: 'Bogu armour and a shinai. Sparring is allowed on this floor — and only on this floor.',
  },
  {
    id: 'holodeck', name: 'HOLODECK', mult: 6,
    blurb: 'Gear up in the pod and step straight into the simulator. Come out and you are home again.',
  },
];
export const ROOM_TYPE_BY_ID = Object.fromEntries(ROOM_TYPES.map((r) => [r.id, r]));

/**
 * Furniture and activities.
 *
 * `where`:  'room'  — on a tatami grid cell indoors
 *           'water' / 'garden' / 'court' / 'grove' — a yard plot of that kind
 * A yard plot says what it is (homeisle.js lays them), and an item fits only
 * the plots it names — that is the "valid, theme-matching area" rule.
 *
 * `cells` — footprint on the tatami grid (1 cell = 2 units) for room items.
 * `model` — a vendored Polyfork GLB in public/models/polyfork/, or null for
 *           one drawn here. EVERY ONE HAS A PROCEDURAL FALLBACK (models.js):
 *           delete the folder and the game still plays.
 * `mult`  — price as a fraction of one orb.
 * `act`   — what pressing INTERACT at it does, if anything.
 * `later` — shown, locked, and not for sale yet (the Bushido-Blade forest).
 */
export const ITEMS = [
  // ---------------------------------------------------------------- indoors
  { id: 'andon', name: 'PAPER FLOOR LAMP', where: ['room'], cells: [1, 1], mult: 0.15, model: 'andon-floor-lantern-b1b7ea' },
  { id: 'futon', name: 'FUTON', where: ['room'], cells: [1, 2], mult: 0.25, model: null, act: 'nap' },
  { id: 'kotatsu', name: 'KOTATSU TABLE', where: ['room'], cells: [2, 2], mult: 0.4, model: null },
  { id: 'tansu', name: 'TANSU CHEST', where: ['room'], cells: [1, 1], mult: 0.3, model: null, act: 'chest' },
  { id: 'yoroi', name: 'SAMURAI ARMOUR', where: ['room'], cells: [1, 1], mult: 0.6, model: 'yoroi-armour-stand-25f9a2' },
  { id: 'katana', name: 'KATANA ON A STAND', where: ['room'], cells: [1, 1], mult: 0.35, model: 'katana-in-scabbard-4b6ffb' },
  { id: 'drum', name: 'TAIKO DRUM', where: ['room', 'garden'], cells: [1, 1], mult: 0.45, model: 'war-drum-on-stand-cbb91a', act: 'drum' },
  { id: 'bucket', name: 'WOODEN BUCKET', where: ['room', 'garden'], cells: [1, 1], mult: 0.05, model: 'wooden-teoke-bucket-e65f35' },
  { id: 'sake', name: 'BIG BARREL', where: ['room', 'garden'], cells: [1, 1], mult: 0.1, model: 'komodaru-sake-barrel-c5199a' },
  { id: 'kitchen', name: 'KITCHEN', where: ['room'], cells: [2, 1], mult: 0.8, model: null, act: 'cook' },
  // ------------------------------------------------------------------- yard
  { id: 'koipond', name: 'KOI POND', where: ['water'], mult: 2, model: null, act: 'koi',
    blurb: 'Feed the koi once or twice a week and they grow — and rare colours turn up. Bring a rod and FISH!' },
  { id: 'onsen', name: 'ONSEN HOT SPRING', where: ['water'], mult: 2.5, model: null, act: 'soak',
    blurb: 'A steaming stone pool. Sit in it and your kitten gets rosy.' },
  { id: 'volleyball', name: 'VOLLEYBALL COURT', where: ['court'], mult: 1.5, model: null, act: 'volley',
    blurb: 'A sand court and a net. Bat the ball over with your katana.' },
  { id: 'bamboofarm', name: 'BAMBOO FARM', where: ['grove'], mult: 1.5, model: null, act: 'harvest',
    blurb: 'Bamboo that grows back in REAL time — harvest it and sell it to Roshi.' },
  { id: 'pen', name: 'ANIMAL PEN', where: ['garden', 'court'], mult: 2, model: null, act: 'animals',
    blurb: 'Raise animals in real time. Visit once or twice a week — they never run away, they just get hungry.' },
  { id: 'treehouse', name: 'TREEHOUSE', where: ['grove'], mult: 1.8, model: null, act: 'climb',
    blurb: 'A cherry tree with a little house in it. Climb up the ladder.' },
  { id: 'shrine', name: 'LITTLE SHRINE', where: ['garden'], mult: 1.2, model: 'tiered-pagoda-f4ade0', act: 'pray',
    blurb: 'A tiered pagoda shrine for your island.' },
  { id: 'stones', name: 'JUMPING STONES', where: ['water', 'garden'], mult: 0.6, model: null,
    blurb: 'Stepping stones to hop across.' },
  { id: 'toriigarden', name: 'TORII GARDEN', where: ['garden'], mult: 0.9, model: null,
    blurb: 'A row of little red gates over a path.' },
  { id: 'well', name: 'ROOFED WELL', where: ['garden'], mult: 0.5, model: 'roofed-well-43a2fc' },
  { id: 'waterwheel', name: 'WATER WHEEL', where: ['water'], mult: 0.7, model: 'stream-water-wheel-ea2d68' },
  { id: 'belltower', name: 'BELL TOWER', where: ['garden', 'court'], mult: 1.0, model: 'temple-bell-tower-745387', act: 'bell' },
  { id: 'teahouse', name: 'TEAHOUSE', where: ['garden', 'court'], mult: 1.2, model: 'open-front-teahouse-c7dd18' },
  { id: 'basin', name: 'STONE BASIN', where: ['garden'], mult: 0.3, model: 'tsukubai-stone-basin-677586' },
  { id: 'lantern', name: 'STONE LANTERN', where: ['garden', 'water'], mult: 0.15, model: 'stone-lantern-d56d0a' },
  { id: 'maple', name: 'MAPLE TREE', where: ['garden', 'grove'], mult: 0.3, model: 'japanese-maple-d2fb29' },
  { id: 'cherry', name: 'CHERRY TREE', where: ['garden', 'grove'], mult: 0.35, model: 'cherry-tree-a710a9' },
  { id: 'pine', name: 'SCULPTED PINE', where: ['garden'], mult: 0.3, model: 'sculpted-pine-e45d4f' },
  { id: 'azalea', name: 'AZALEA BUSH', where: ['garden', 'water'], mult: 0.1, model: 'azalea-bush-7bb14d' },
  { id: 'fence', name: 'BAMBOO FENCE', where: ['garden', 'grove', 'court'], mult: 0.1, model: 'takegaki-bamboo-fence-c6718b' },
  { id: 'firebasket', name: 'FIRE BASKET', where: ['garden', 'court'], mult: 0.2, model: 'kagaribi-fire-basket-d28c11' },
  { id: 'bench', name: 'TEAHOUSE BENCH', where: ['garden', 'court', 'water'], mult: 0.1, model: 'teahouse-bench-6b34e1' },
  { id: 'banner', name: 'NOBORI BANNER', where: ['garden', 'court'], mult: 0.1, model: 'nobori-banner-ae4d88' },
  { id: 'paddy', name: 'RICE PADDY', where: ['grove', 'garden'], mult: 0.4, model: 'rice-paddy-tile-dc727e' },
  { id: 'reeds', name: 'REEDS', where: ['water'], mult: 0.05, model: 'moat-reed-clump-dd6b60' },
  {
    id: 'bladeforest', name: 'BUSHIDO BAMBOO FOREST', where: ['grove'], mult: 4, model: null, later: true,
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
