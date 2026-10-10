/* ---------------------------------------------------------------------------
   THE MAP OF THE SIMULATOR — where every training island floats.

   Richard's brief: "floating islands and fragmented worlds/consciousness that
   are connected virtually", "Each different game mode or game type can be on
   a separate island and the players will either have to cross the bridge by
   running, or if it is far away, maybe they can jump on a tron-style
   motorcycle".

   SPOKES OFF THE HOLO-DOJO, MEASURED FROM THE PORT. Angle 0 is the line from
   the Dojo's centre to Lionheart's island (the arcade, where every kitten
   arrives), so "the first two islands are either side of where you came in"
   is a fact about the layout and not about which way the real archipelago
   happens to face. Near islands are a walk over a data bridge; far ones
   (`cycle: true`) have a light-cycle pad at each end of a data highway.

   ONE TABLE, so a stage that adds an island cannot put it on top of one that
   is already there: `world-check` measures every pair for a clear gap.

   Gaps, measured with the law of cosines against the hub (r 50) and the port
   (r 14 at 96): the tightest pair is the Gallery and the port at ~37 units of
   clear void, which is a bridge you can see across and cannot jump.
--------------------------------------------------------------------------- */

export const ISLANDS = {
  gallery: { ang: 38, dist: 128, r: 24, dy: 4, name: 'KOTODAMA GALLERY', kanji: '言霊' },
  hall: { ang: -38, dist: 128, r: 24, dy: 2, name: 'CLAN TRIAL HALL', kanji: '一族' },
  range: { ang: 78, dist: 138, r: 24, dy: 6, name: 'TAMESHIGIRI RANGE', kanji: '試斬' },
  kata: { ang: -78, dist: 138, r: 22, dy: 8, name: 'KATA TRACE', kanji: '型' },
  storm: { ang: 116, dist: 150, r: 24, dy: 3, name: 'KUDAMONO STORM', kanji: '果物' },
  sine: { ang: -116, dist: 150, r: 26, dy: 5, name: 'SINE GAUNTLET', kanji: '正弦' },
  sentries: { ang: 150, dist: 250, r: 26, dy: 10, name: 'HOLO-SENTRIES', kanji: '番兵', cycle: true },
  bamboo: { ang: -150, dist: 250, r: 30, dy: 0, name: 'BAMBOO INFILTRATION', kanji: '忍', cycle: true },
  school: { ang: 180, dist: 150, r: 28, dy: 0, name: 'ARENA SCHOOL', kanji: '闘技' },
  /* STRAIGHT ON PAST THE SCHOOL, so its highway starts on the school's far
     rim (`from`) rather than at the hub — see `_raiseIsland`. */
  shadow: { ang: 180, dist: 330, r: 30, dy: 26, name: 'SHADOW LIONHEART', kanji: '影', cycle: true, from: 'school' },
};

/**
 * WHAT EACH ISLAND IS, IN TWO SIZES: a word for a map with ten of them on it,
 * and a sentence a nine-year-old can read before she decides to cross.
 *
 * ONE TABLE FOR EVERY PLACE THAT SAYS IT — Lionheart's card and its map
 * (dream/lionguide.js), the minimap in here, the map kiosk on the hub and the
 * Help page's Dream Dojo cards — so an island that changes what it does is
 * re-described once. The Help page is HTML and cannot import this; world-check
 * holds it to these sentences.
 *
 * Each `about` is checked against its island's own header comment, which is
 * where what the island does is written down: re-read that before rewording.
 */
/* SHORT, ON PURPOSE. Richard, reading the Help page: "remove some of the
   extra long text that is unneeded, like all the math equation stuff in the
   Sine Gauntlet as no one understands the math equations anyways, just be
   specific and to the point". The equations are still on the islands, where
   the thing they describe is moving in front of her; a sentence is for
   choosing where to go. */
export const ISLE_ABOUT = {
  gallery: { short: 'GALLERY', about: 'Every Kotodama orb on a pedestal. Try its drill — win it, and that orb is yours in here.' },
  hall: { short: 'TRIAL HALL', about: 'All six clans. Swear an oath, then pass the trial that needs its power.' },
  range: { short: 'RANGE', about: 'Three sword drills: ONE SWING, COMBO 60 and CLEAN CUT.' },
  kata: { short: 'KATA', about: 'Pick any song. Lionheart attacks on the beat — step off his blows and jump his sweeps. Write your own routines too.' },
  storm: { short: 'STORM', about: 'Cut the holo-fruit out of the air before it lands. Leave the purple viruses alone.' },
  sine: { short: 'SINE', about: 'An obstacle course of laser bars, one kitten at a time. Duck, jump and dodge — the fastest time wins.' },
  sentries: { short: 'SENTRIES', about: 'Sentries that shoot back, always with a warning. Dodge or raise your Ward, then hit the core.' },
  bamboo: { short: 'BAMBOO', about: 'Sneak through the bamboo past the watchers. Hide while they look, move when they look away.' },
  school: { short: 'SCHOOL', about: "The tournament, practised: the Feast's animals, a round of every league, and the scoreboard." },
  shadow: { short: 'SHADOW', about: "Lionheart's Shadow, on three levels. Beat MEDIUM for a special orb; beat all three for his 凶 Cross Slash." },
};

/**
 * Where an island's centre is, in the layer's own coordinates.
 * @param {{x:number,y:number,z:number}} dojo  the Dojo's centre (and floor)
 * @param {{x:number,z:number}} u  unit vector from the Dojo to the arcade
 */
export function islandCentre(dojo, u, spec) {
  const a = (spec.ang * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  // Rotate u by the spoke angle (positive = screen-left of the port).
  const dx = u.x * c - u.z * s;
  const dz = u.x * s + u.z * c;
  return { x: dojo.x + dx * spec.dist, z: dojo.z + dz * spec.dist, y: dojo.y + spec.dy, r: spec.r, dir: { x: dx, z: dz } };
}
