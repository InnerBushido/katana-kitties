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
  school: { ang: 180, dist: 150, r: 28, dy: 0, name: 'ARENA SCHOOL', kanji: '闘技', },
  shadow: { ang: 180, dist: 330, r: 30, dy: 26, name: "SHADOW LIONHEART", kanji: '影', cycle: true },
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
