/* ---------------------------------------------------------------------------
   忍 THE FIVE COURSES, as data (read by bamboolevel.js; see its header for
   the shapes). Richard: "five levels: L1 harder than v1, the last near
   impossible", with "hologram houses and patrolling enemies", "climbing,
   platforms, upside-down ropes between buildings", "mini-village levels with
   indoor sneaking", archers that "see through bamboo".

   EACH COURSE TEACHES ONE THING and keeps the ones before it:
     竹林 THE BAMBOO PATH   crawling, cones, cover, the pebble
     村   THE VILLAGE       houses — in through a door, up a ladder, along a
                            rope over the street — and the first archer
     円   THE SHRINE CIRCLE  a guard who walks a circle, and the smoke bomb
     城   THE CASTLE        archers on the walls, shuriken to put guards down
     影   THE SHADOW MAZE   all of it, tight, with hardly a lantern

   EVERY ONE IS CHECKED, at every difficulty, by `solve` in world-check: a
   kitten crawling on the ground alone — no rope, no pebble, no smoke — gets
   to the scroll unseen. The tools and the high routes are FASTER, never
   NECESSARY. `bands` (per difficulty, seconds, the time plus CAUGHT_COST a
   capture) are set off the solver's time: three stars at about twice its
   perfect-knowledge crawl plus a breath to read the course (a kitten has to
   WATCH a patrol before she can time it — the solver never does), two at
   double that, one for getting there at all. world-check holds every 3★ bar
   at least 1.5x the solver's answer, so no star is unwinnable.

   Angles are degrees from +a toward +b (a look of 90 faces +b).
--------------------------------------------------------------------------- */

/** One course's stars id at one difficulty: 'bamboo.path.e'. */
export const starsId = (course, n) => `bamboo.${course}.${'enh'[n]}`;

export const COURSES = [
  {
    id: 'path', kanji: '竹林', name: 'THE BAMBOO PATH', music: 'forest',
    blurb: 'Crawl past the patrols. Bamboo and long grass hide you.',
    teach: 'hold the WARD button to crawl — nobody hears you',
    scroll: { a: 22.6, b: -5 },
    paths: [
      { pts: [[-17, 0], [-10, 0]], w: 4 },
      { pts: [[-3, -5.5], [3, -12.5]], w: 3 },
      { pts: [[10, -12], [12.5, -1]], w: 3 },
      { pts: [[18, 0.5], [22.6, -5]], w: 3.6 },
    ],
    rects: [
      { a0: -11, a1: -2, b0: -7, b1: 7 },
      { a0: 1, a1: 12, b0: -19, b1: -11 },
      { a0: 9, a1: 19, b0: -3, b1: 9 },
    ],
    clumps: [
      { a: -7.5, b: 2.2 }, { a: -4, b: -1.8 },
      { a: 6, b: -12.4 }, { a: 8.5, b: -17.6 },
      { a: 14, b: 3 }, { a: 14.9, b: 3.6, r: 0.8 }, { a: 13.2, b: 3.8, r: 0.8 },
    ],
    thickets: [{ a: -6.5, b: -4.6 }, { a: -4.2, b: 4.6, r: 1.4 }, { a: 3.6, b: -17.6, r: 1.4 }, { a: 17.4, b: 7.2, r: 1.4 }],
    barrels: [{ a: -9.6, b: -5.6 }, { a: 11, b: -12 }, { a: 10, b: 8 }],
    crates: [{ a: 6.4, b: -17.8 }],
    lanterns: [
      { a: -9.8, b: 5.6, d: [0] },
      { a: 11.6, b: -6.5, d: [0, 1, 2] },
      { a: 10, b: -1.8, d: [0, 1] },
    ],
    pickups: [],
    guards: [
      { kind: 'samurai', route: [{ a: -2.6, b: 6.2, wait: 999, look: -124, scan: 42, rate: 0.8 }] },
      {
        kind: 'samurai',
        route: [{ a: 2.5, b: -15, wait: 2.2, look: 180, scan: 50 }, { a: 10.5, b: -15, wait: 2.2, look: 0, scan: 50 }],
      },
      {
        kind: 'samurai', t0: 0,
        route: [{ a: 11, b: -1.2, wait: 1.2, look: 90, scan: 35 }, { a: 17.2, b: -1.2, wait: 1.2, look: 135, scan: 35 },
          { a: 17.2, b: 7.6, wait: 1.2, look: -135, scan: 35 }, { a: 11, b: 7.6, wait: 1.2, look: -45, scan: 35 }],
      },
      { kind: 'samurai', minDiff: 1, route: [{ a: 18.4, b: -2.4, wait: 999, look: 150, scan: 30, rate: 0.7, ph: 1.4 }] },
    ],
    bands: [[999, 90, 45], [999, 110, 55], [999, 100, 50]],
  },
  {
    id: 'village', kanji: '村', name: 'THE VILLAGE', music: 'village',
    blurb: 'In through the doors, up the ladders, along the ropes.',
    teach: 'jump up to a rope to hang from it — JUMP lets go',
    scroll: { a: 21.5, b: 0 },
    paths: [{ pts: [[-17, 0], [-9, 0]], w: 4 }],
    rects: [
      { a0: -9.5, a1: 16, b0: -3, b1: 3 },          // the street
      { a0: 1, a1: 4.5, b0: -9, b1: -3 },           // the alley between the left houses
      { a0: 16, a1: 23, b0: -7, b1: 7 },            // the square, with the scroll
      { a0: -9.5, a1: -6.5, b0: 3, b1: 12 },        // the lane up the right
      { a0: -9.5, a1: 15, b0: 12, b1: 15 },         // ...and behind the right houses
      { a0: 13, a1: 16, b0: 7, b1: 12 },
      { a0: 12.5, a1: 16, b0: -9, b1: -4 },         // h2's back yard, into the square's corner
    ],
    houses: [
      { id: 'h1', a0: -6.5, a1: 1, b0: -11, b1: -3, h: 4.4, doors: [{ side: 'b1', at: -3, w: 1.8 }, { side: 'a1', at: -6, w: 1.8 }], ladder: { side: 'a0', at: -7 } },
      { id: 'h2', a0: 4.5, a1: 12.5, b0: -11, b1: -3, h: 4.4, doors: [{ side: 'a0', at: -6, w: 1.8 }, { side: 'a1', at: -6.5, w: 1.8 }] },
      { id: 'h3', a0: -5, a1: 3, b0: 3, b1: 12, h: 5.2, doors: [{ side: 'b1', at: -1, w: 1.8 }], ladder: { side: 'b1', at: 2 } },
      { id: 'h4', a0: 6, a1: 13, b0: 3, b1: 12, h: 5.2, doors: [{ side: 'b1', at: 9.5, w: 1.8 }, { side: 'a1', at: 7.5, w: 1.8 }], ladder: { side: 'a1', at: 10.5 } },
    ],
    ropes: [{ from: [-1, -6.8], to: [-1, 6.8], y: 7.4 }, { from: [2.4, 7.5], to: [6.6, 7.5], y: 7.6 }],
    towers: [{ a: 22, b: 9.2, r: 1.3, h: 5.5 }],
    clumps: [{ a: 19.5, b: -5.5 }],
    barrels: [{ a: -8.6, b: -2.2 }, { a: 2.6, b: -8.2 }, { a: 15, b: 2.2 }, { a: -8, b: 11 }, { a: 11.6, b: -10 }],
    crates: [{ a: 8.5, b: 2.2 }, { a: 17.4, b: -6 }, { a: 14, b: 13.8 }, { a: -0.6, b: 13.8 }],
    thickets: [],
    lanterns: [
      { a: -8, b: 6, d: [0, 1] },
      { a: 2.8, b: -4.4, d: [0] },
      { a: 9, b: 13.6, d: [0, 1, 2] },
    ],
    pickups: [{ kind: 'shuriken', a: -1, b: 9.5, d: [0, 1, 2] }],
    guards: [
      /* THE STREET IS WATCHED FROM BOTH ENDS: a walker on the near half and a
         sentry at the square's mouth sweeping down it. Following the walker
         (what the solver did when he was alone) walks into the sentry, so the
         way through is the houses — which is what this course is for. */
      { kind: 'samurai', route: [{ a: -7, b: 0, wait: 1.5, look: 0, scan: 30 }, { a: 6, b: 0, wait: 1.5, look: 180, scan: 30 }] },
      { kind: 'samurai', route: [{ a: 15, b: -1, wait: 999, look: 180, scan: 32, rate: 0.5 }] },
      { kind: 'samurai', route: [{ a: 6, b: -9.5, wait: 2, look: 45, scan: 45 }, { a: 11, b: -9.5, wait: 2, look: 135, scan: 45 }] },
      { kind: 'samurai', minDiff: 1, route: [{ a: -3.5, b: 13.5, wait: 1.4, look: 0, scan: 30 }, { a: 14.4, b: 13.5, wait: 1.4, look: 180, scan: 30 }] },
      // A searchlight across the square, slow enough to cross under.
      { kind: 'archer', y: 5.5, route: [{ a: 22, b: 9.2, wait: 999, look: -95, scan: 55, rate: 0.4 }] },
    ],
    bands: [[999, 80, 40], [999, 110, 55], [999, 120, 60]],
  },
  {
    id: 'shrine', kanji: '円', name: 'THE SHRINE CIRCLE', music: 'forest',
    blurb: 'Round the shrine, between the guards who walk its circle.',
    teach: 'a guard on the circle is where cos and sin put him — a smoke bomb hides you',
    scroll: { a: 21, b: -6.5 },
    /* THE CIRCLE IS THE LESSON. Its guards stand at (cos θ, sin θ) of a
       radius, θ turning at their walking speed — the Dojo of the Turning
       Circle's point, walking — and the grove in the middle is why you can
       follow one: round a curve, sight runs out at the chord that grazes the
       grove, √(r1² − r0²) each way. Two niches off its sides hold a thicket to
       crawl into while a guard goes past, and one of them the smoke bomb. */
    paths: [{ pts: [[-17, 0], [-4.5, 0]], w: 3.6 }, { pts: [[14, 0], [17.5, -3.2], [21, -6.5]], w: 3 }],
    rings: [{ a: 4.5, b: 0, r0: 6.5, r1: 10.5 }, { a: 4.5, b: 12.4, r0: 0, r1: 2.3 }, { a: 4.5, b: -12.4, r0: 0, r1: 2.3 }],
    clumps: [{ a: -1.9, b: 7.6 }, { a: 10.9, b: -7.6 }, { a: 13.6, b: 4.2 }],
    thickets: [{ a: 4.5, b: 13, r: 1.3 }, { a: 4.5, b: -13, r: 1.3 }, { a: -3.4, b: -5.2, r: 1.1 }],
    barrels: [{ a: 12.2, b: 6.9 }, { a: 19.6, b: -4.2 }],
    crates: [{ a: -3.6, b: 6.4 }],
    lanterns: [
      { a: -9, b: 1.3, d: [0, 1, 2] },
      { a: 4.5, b: 13.6, d: [0] },
      { a: 4.5, b: -13.8, d: [0, 1] },
    ],
    pickups: [{ kind: 'smoke', a: 4.5, b: -12.2, d: [0, 1, 2] }],
    guards: [
      { kind: 'samurai', circle: { a: 4.5, b: 0, R: 8.5, dir: 1, th0: 0 } },
      { kind: 'samurai', circle: { a: 4.5, b: 0, R: 8.5, dir: 1, th0: 180 } },
      // HARD: one walking the other way, slower, so the gaps close from both sides.
      { kind: 'samurai', minDiff: 2, circle: { a: 4.5, b: 0, R: 8.5, dir: -1, th0: 90, speed: 2.4 } },
      { kind: 'samurai', minDiff: 1, route: [{ a: 17.6, b: -1.4, wait: 999, look: 180, scan: 55, rate: 0.55 }] },
    ],
    bands: [[999, 80, 40], [999, 80, 40], [999, 130, 65]],
  },
  {
    id: 'castle', kanji: '城', name: 'THE CASTLE', music: 'castle',
    blurb: 'Archers on the towers, a samurai in the keep. The scroll is inside.',
    teach: 'pick up a shuriken and THROW it at a guard to put him to sleep',
    scroll: { a: 18, b: 0 },
    paths: [{ pts: [[-17, 0], [-8, 0]], w: 4 }],
    rects: [
      { a0: -8.5, a1: 9, b0: -14, b1: 14 },          // the courtyard
      { a0: 9, a1: 21.5, b0: -9, b1: -6 },           // round the keep's left...
      { a0: 9, a1: 21.5, b0: 6, b1: 9 },             // ...and right
    ],
    houses: [
      { id: 'keep', a0: 10, a1: 21, b0: -6, b1: 6, h: 6, doors: [{ side: 'a0', at: 0, w: 2 }, { side: 'b0', at: 17, w: 1.8 }, { side: 'b1', at: 13, w: 1.8 }], ladder: { side: 'b1', at: 18.5 } },
      { id: 'store', a0: -4, a1: 3, b0: -13.5, b1: -7, h: 4.2, doors: [{ side: 'b1', at: -1.5, w: 1.8 }, { side: 'a1', at: -10, w: 1.8 }] },
      { id: 'barracks', a0: -4, a1: 4, b0: 7, b1: 13.5, h: 4.2, doors: [{ side: 'b0', at: 0, w: 1.8 }], ladder: { side: 'a0', at: 10 } },
    ],
    ropes: [{ from: [3, 10], to: [11.5, 4.6], y: 7.8 }],
    towers: [{ a: -7, b: -16.2, r: 1.3, h: 6 }, { a: 7.6, b: 16.4, r: 1.3, h: 6 }],
    clumps: [],
    thickets: [],
    barrels: [{ a: -6.8, b: 3.2 }, { a: 7.6, b: -2.8 }, { a: 8.2, b: 11.8 }, { a: 20.4, b: -8 }],
    crates: [{ a: -2, b: 3.6 }, { a: 1.5, b: -4.6 }, { a: 5.6, b: 4.8 }, { a: 6, b: -11.6 }, { a: 12, b: 7.6 }, { a: 15.5, b: -7.4 }],
    lanterns: [
      { a: -6.8, b: -2.6, d: [0, 1, 2] },
      { a: 0, b: -12, d: [0, 1] },
      { a: 1, b: 12.2, d: [0] },
    ],
    pickups: [{ kind: 'shuriken', a: -2.8, b: -9, d: [0, 1, 2] }, { kind: 'smoke', a: -2.6, b: 12.4, d: [0, 1] }],
    guards: [
      { kind: 'samurai', route: [{ a: -5.5, b: -5, wait: 1.2, look: 0, scan: 35 }, { a: 6.5, b: -5, wait: 1.2, look: 90, scan: 35 },
        { a: 6.5, b: 5, wait: 1.2, look: 180, scan: 35 }, { a: -5.5, b: 5, wait: 1.2, look: -90, scan: 35 }] },
      { kind: 'samurai', route: [{ a: 12, b: -3.5, wait: 1.6, look: 90, scan: 40 }, { a: 12, b: 3.5, wait: 1.6, look: -90, scan: 40 }] },
      { kind: 'samurai', minDiff: 1, route: [{ a: 19.8, b: -7.5, wait: 2, look: 0, scan: 30 }, { a: 19.8, b: 7.5, wait: 2, look: 180, scan: 30 }] },
      { kind: 'archer', y: 6, route: [{ a: -7, b: -16.2, wait: 999, look: 45, scan: 40, rate: 0.35 }] },
      { kind: 'archer', y: 6, minDiff: 1, route: [{ a: 7.6, b: 16.4, wait: 999, look: -135, scan: 40, rate: 0.3, ph: 2 }] },
    ],
    bands: [[999, 90, 45], [999, 90, 45], [999, 170, 85]],
  },
  {
    id: 'shadow', kanji: '影', name: 'THE SHADOW MAZE', music: 'shadow',
    blurb: 'Narrow ways, sharp eyes, hardly a lantern. Nearly impossible.',
    teach: 'the archer sees through bamboo — watch his light, not the wall',
    scroll: { a: 21.5, b: 3 },
    /* NEAR IMPOSSIBLE, Richard's words, and still solved at every difficulty
       by world-check's crawl — a course nobody can finish is not hard, it is
       broken. What makes it hard is that every junction is watched and the
       archer in the middle sees straight through the canes. */
    paths: [
      { pts: [[-17, 0], [-10, 0]], w: 3 },
      { pts: [[-10, 10], [-10, -14], [14, -14]], w: 2.4 },
      { pts: [[-10, 2], [-2, 2], [-2, -6], [6, -6], [6, 2]], w: 2.4 },
      { pts: [[-2, -14], [-2, -6]], w: 2.4 },
      { pts: [[-10, 10], [14, 10], [14, 2], [21.5, 2], [21.5, -6]], w: 2.4 },
      { pts: [[6, 2], [6, 10]], w: 2.4 },
      { pts: [[14, -14], [14, -6], [21.5, -6]], w: 2.4 },
    ],
    towers: [{ a: 6, b: -10, r: 1.3, h: 6 }],
    clumps: [],
    thickets: [{ a: -10, b: 6.5, r: 1 }, { a: 2, b: -14, r: 1 }, { a: 17.6, b: 2, r: 1 }],
    barrels: [{ a: -2.9, b: -10.6 }, { a: 13.1, b: 6.4 }],
    crates: [{ a: 5.1, b: -1.5 }, { a: 10, b: 10.9 }],
    lanterns: [{ a: -10, b: -9, d: [0] }, { a: 6, b: 6.2, d: [0, 1] }],
    pickups: [{ kind: 'smoke', a: -2, b: -12.6, d: [0, 1, 2] }, { kind: 'shuriken', a: 6.9, b: 9.8, d: [0, 1, 2] }],
    guards: [
      { kind: 'samurai', route: [{ a: -10, b: -12.5, wait: 999, look: 0, scan: 25, rate: 0.6 }] },
      { kind: 'samurai', route: [{ a: -0.5, b: 2, wait: 1, look: 180, scan: 20 }, { a: -0.5, b: -6, wait: 0.6 }, { a: 4.5, b: -6, wait: 1, look: 0, scan: 20 }, { a: -0.5, b: -6, wait: 0.6 }] },
      { kind: 'samurai', route: [{ a: -8.5, b: 10, wait: 1.2, look: 90, scan: 20 }, { a: 12.5, b: 10, wait: 1.2, look: -90, scan: 20 }] },
      { kind: 'samurai', route: [{ a: 14, b: -12.5, wait: 999, look: 0, scan: 30, rate: 0.5, ph: 1 }] },
      { kind: 'samurai', minDiff: 1, route: [{ a: 20, b: 2, wait: 999, look: -90, scan: 30, rate: 0.7 }] },
      { kind: 'samurai', minDiff: 2, route: [{ a: 14, b: 3.5, wait: 1, look: 0 }, { a: 14, b: 8.5, wait: 1, look: 180 }] },
      { kind: 'archer', y: 6, route: [{ a: 6, b: -10, wait: 999, look: 0, scan: 120, rate: 0.28 }] },
    ],
    bands: [[999, 90, 45], [999, 100, 50], [999, 120, 60]],
  },
];

export const courseById = (id) => COURSES.find((c) => c.id === id) ?? null;
