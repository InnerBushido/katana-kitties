import * as THREE from 'three';
import { Billboard, paint, toonVertexMat } from '../core/gfx.js';
import { bubbleTexture } from '../entities/leader.js';
import { mergeParts } from '../world/build.js';
import { SimWorld, SIM, HOLO, toSim } from '../world/simworld.js';
import { MathDojo } from './mathdojo.js';
import { aggregate, ORB_BY_ID } from '../entities/powerorb.js';
import { buildWornOrbs } from './kotodama.js';
import { TrainingGate, Shards } from './dream/targets.js';
import { makeSimHud } from './dream/simhud.js';
import { DreamProgress } from './dream/progress.js';
import { Drill } from './dream/drill.js';
import { Gallery } from './dream/gallery.js';
import { TrialHall } from './dream/hall.js';
import { TameshigiriRange } from './dream/range.js';
import { KataHall } from './dream/kata.js';
import { DataHighway } from './dream/highway.js';
import { KudamonoStorm } from './dream/storm.js';
import { SineGauntlet } from './dream/sine.js';
import { HoloSentries } from './dream/sentries.js';
import { BambooInfiltration } from './dream/bamboo.js';
import { ArenaSchool } from './dream/school.js';
import { Ranks } from './dream/rank.js';
import { ShadowFight, SHADOW_LINES, HANDOVER } from './dream/shadow.js';
import { LionVoice, VOICE_TAIL } from './dream/lionvoice.js';
import { Rundown } from './dream/rundown.js';
import { ISLANDS, islandCentre } from './dream/islands.js';
import { SimBar, holoFlicker } from './dream/holo.js';
import { Approach } from './dream/approach.js';
import { Lecture } from './dream/lecture.js';
import { GearRoom, GEAR_ITEMS } from './dream/gear.js';
import { gateFrame, buildGate } from './dream/gate.js';
import { TOUR, GEAR_LINES, GEAR_VOICE } from './dream/stories.js';
import { TourShadow } from './dream/tourshadow.js';
import { TourCast } from './dream/tourcast.js';
import { holoDojo } from './dream/holodojo.js';
import { peekWeight } from './dream/peek.js';

/** Her single-cell pose billboards, which the tube puppet mirrors. */
const PUPPET_POSES = ['eatPose', 'blessPose', 'warpPose', 'breathPose', 'scaredPose', 'sweepPose'];

/* ---------------------------------------------------------------------------
   LIONHEART'S DREAM DOJO — the VR arcade north-east of the Turning Circle.

   Richard's own startup, prototyped inside his nieces' game: "start to build
   my 'Dream Dojo / Soldier Simulator' idea here in this game before going out
   and building for real". Lionheart is Richard; the arcade is his.

   THE SHAPE OF IT, as asked for:

     · his own little floating island beside the Dojo, that "dragons and
       pandas can't enter", so "players have to jump" — a dome keeps animals
       off, and two stepping stones are the way across;
     · four holographic tubes, one per kitten. She walks to hers, the visor
       goes on, she floats up, and "the view phases into VR";
     · VR is "a separate reality ... the same location, but on a different
       layer of existence" — see world/simworld.js for how, and why an offset;
     · while she is in, "the real-world body mirrors her attacks": a puppet
       of her floats in the tube doing whatever she is doing in there.

   WHAT IT MUST NOT BREAK. The arcade adds; it never changes the game at two
   players who are not using it (non-negotiable 5): every hook into `Game` is
   a no-op for a kitten with no `dream` state, and `world-check` pins that. It
   never fights (3): nothing in here calls `strikePlayers`. Nothing is lost
   (4): a kitten can never be stranded in the simulator — any scene, the
   tournament, the ending or a save pulls her out to her tube, and a save
   taken while she is in records her TUBE, not her sim coordinates.
--------------------------------------------------------------------------- */

/** Lionheart's island. North-east of the Dojo's centre, 96 units out along
 *  the diagonal, which leaves a 16-unit gap off the Dojo's rim (measured: the
 *  Dojo is walkable to r=66 at y=30 all round its north-east quarter). */
export const ARCADE = { x: -162, z: 2, r: 14, y: 33 };
/** The dome that keeps animals out. A little larger than the pad so a dragon
 *  is turned away before its wing is over the deck. */
export const DOME_R = 19;
/** How far outside the dome's skin an animal is held — a wing's width. */
export const ANIMAL_PAD = 1.5;

/**
 * WHERE THE DOME PUTS AN ANIMAL at `pos`, or null if it is clear: the
 * corrected point and the outward normal. Pure, for `world-check`.
 *
 * THE DOME'S OWN SHAPE, NOT A TUBE. Richard: "Dragon outside of the Dream Dojo
 * is getting stuck on the shell of the dojo island. Also, seems there is a
 * barrier above the dream dojo preventing dragon from flying directly above
 * it, let's remove that, we want the player and dragon to be able to fly next
 * to the dome". It WAS a tube — every animal within DOME_R + 1.5 of the pad's
 * axis, from 12 below the deck to 4 above the dome's crown, pushed straight
 * out sideways. So at the dome's shoulder the wall stood 20.5 out where the
 * glass is 7, a dragon could not pass over the crown at all, and a push that
 * is only ever sideways has nothing in it to slide along: a dragon flying at
 * the middle stopped dead against air.
 *
 * Now three pieces, each the thing that is drawn there:
 *  · the DOME — a hemisphere on the mesh's own centre, pushed out along its
 *    normal, so a dragon at the crown is lifted over it and one at the
 *    shoulder rolls round it;
 *  · its RIM — under the glass's edge, the deck's own depth, so nothing flies
 *    in under the hem;
 *  · the ROCK the pad sits on — the upside-down cone that is drawn there.
 */
export function animalContact(pos) {
  const R = DOME_R + ANIMAL_PAD;
  const cy = ARCADE.y - 0.5;
  const dx = pos.x - ARCADE.x;
  const dz = pos.z - ARCADE.z;
  const h = Math.hypot(dx, dz);
  const side = (r) => (h > 1e-3
    ? { x: ARCADE.x + (dx / h) * r, y: pos.y, z: ARCADE.z + (dz / h) * r, n: { x: dx / h, y: 0, z: dz / h } }
    : { x: ARCADE.x + r, y: pos.y, z: ARCADE.z, n: { x: 1, y: 0, z: 0 } });
  if (pos.y >= cy) {
    const dy = pos.y - cy;
    const r = Math.hypot(h, dy);
    if (r >= R) return null;
    if (r < 1e-4) return { x: ARCADE.x, y: cy + R, z: ARCADE.z, n: { x: 0, y: 1, z: 0 } };
    const n = { x: dx / r, y: dy / r, z: dz / r };
    return { x: ARCADE.x + n.x * R, y: cy + n.y * R, z: ARCADE.z + n.z * R, n };
  }
  if (pos.y >= ARCADE.y - ROCK.rim) return h < R ? side(R) : null;
  const top = ARCADE.y - ROCK.top;
  if (pos.y < top - ROCK.h) return null;
  const rr = ROCK.r * (pos.y - (top - ROCK.h)) / ROCK.h + ANIMAL_PAD;
  return h < rr ? side(rr) : null;
}
/** The rock under the pad, as it is BUILT below: its top radius, its top's
 *  depth under the deck, its height; and how deep the dome's rim reaches. */
export const ROCK = { r: ARCADE.r * 0.95, top: 1.4, h: 16, rim: 2 };
/** How tall Lionheart stands — Payne's height, he is a grown-up too. */
export const LION_HEIGHT = 6.2;
export const LION_TALK_R = 5.6;
/** A kitten's own tube: how near counts as "in it". */
export const TUBE_R = 1.5;
export const TUBE_IN = 1.7;
/** How high she floats in the tube with the visor on. */
export const FLOAT_H = 1.6;

/** How high the hologram sign floats over the deck, at the middle of its bob. */
export const SIGN_Y = 9.5;

/** The way across: THREE stones (see `arcadeLayout`). `rim` is the Dojo's
 *  measured walkable edge, `gap` every hop edge to edge, `y0` the Dojo's floor
 *  and `rise` each step up — four of them, Dojo to stone to stone to stone to
 *  the gate's landing, 30 to 33. */
export const STONES = { n: 3, r: 2.2, gap: 3.2, rim: 66, y0: 30, rise: 0.75 };
/** How far from the Dojo's centre a kitten who fell is put back down. The
 *  rim is at 66; 63 is three units of floor in front of her toes. */
export const LAUNCH_R = 63;

/**
 * THE TWO CAMERAS OF THE WAY ACROSS (`DreamDojo.cameraFocus`).
 *
 * JUMP — Richard: "when the player gets close to the edge on the Dojo of the
 * Turning Circle and before jumping on the platforms, the camera should zoom
 * in more dynamically to give more of a 3D effect of jumping on the platforms
 * and to make it easier to see the players shadow while jumping, the camera
 * should follow the player as they get closer to the dream dojo, but
 * shouldn't move around too dynamically while they are jumping". So: in
 * close and lower than the walking camera (26 → 18, pitch 0.66 → 0.5), a
 * bearing that is FIXED for the whole crossing (from the launch spot toward
 * the middle of the way across, so the stones sit in the frame the whole way)
 * and a height that only changes when she LANDS — the lens follows her across
 * and does not bob with every jump.
 *
 * DOME — "when the player is within the Dream Dojo sphere, the camera should
 * zoom out a bit to show the entire VR island and sign": the pad's centre,
 * pulled back to 50 at the walking camera's own bearing.
 */
export const JUMP_CAM = { dist: 18, pitch: 0.5, near: 10, far: 20, lift: 1.4 };
export const DOME_CAM = { dist: 50, pitch: 0.6, lift: 3.5 };
const WALK_CAM = { dist: 26, pitch: 0.66, yaw: -Math.PI * 0.25 };
/**
 * THE MUSIC'S SWELL (`DreamDojo.musicLevel`). "starts playing quietly, from a
 * distance, as the user is jumping/commuting to the island and starts getting
 * louder as they get closer, maybe about 50% volume when near it and then full
 * blast volume when people enter the sphere". `far` is measured from the
 * launch spot, so the piece is already there — just — when she stands at the
 * first stone; `floor` is how quiet "quietly" is at the far edge; `near` is
 * the level at the dome's skin. Entering is `in`, leaving is `out`: six units
 * of hysteresis, so a kitten stood on the line does not restart the piece.
 */
export const MUSIC_SWELL = { beyond: 10, floor: 0.08, near: 0.5, out: 6 };

/** The phases spent in (or crossing out of) the tube, framed by her own
 *  follow camera rather than the dome's (`cameraFocus`). */
export const TUBE_PHASES = new Set(['rise', 'link', 'rez', 'sim', 'derez', 'descend']);

/** How fast the crossing's cameras blend in and out, per second. The Dojo's own
 *  `focusT` eases on top; the two together never snap. */
const CAM_BLEND = 1.6;

/** The sequence, in seconds. Named so a check can read them. */
export const SEQ = {
  walkMax: 7,      // auto-walk gives up and places her after this
  suit: 1.9,       // the poof: she turns to the lens and comes out of it in her gear
  unsuit: 1.2,     // the poof on the way out: her own clothes again
  walkOutMax: 4,   // out of the tube on her own legs, then the poof
  rise: 1.8,       // floating up in her gear, a little rain in her pane
  link: 0.7,       // the rain fills the pane; she crosses at the end
  rez: 1.4,        // she is drawn in on the other side
  derez: 1.1,      // disconnecting: drawn away, the rain fills
  descend: 1.6,    // back in the tube, floating down, visor off
};

/** Who stands where on the pad — pure, so `world-check` can measure it.
 *  `u` points from the Dojo to the arcade (into the screen from the game's
 *  fixed north-east-looking camera) and `v` is screen-right. */
export function arcadeLayout(dojoCentre) {
  const dx = ARCADE.x - dojoCentre.x;
  const dz = ARCADE.z - dojoCentre.z;
  const L = Math.hypot(dx, dz);
  const u = { x: dx / L, z: dz / L };
  const v = { x: -u.z, z: u.x };
  const at = (a, b) => ({ x: ARCADE.x + u.x * a + v.x * b, z: ARCADE.z + u.z * a + v.z * b });
  /* THREE STONES, THEN THE GATE. The history, so nobody walks it back:
     · two stones in a straight line, hops of 2.7, 2.5 and 3.8 — "too easy to
       fall";
     · four on a half-circle, every hop ~1.9 — and then Richard: "Too many
       jumping platforms on the way to the Dream Dojo, let's just make it 3
       platforms to make it a bit more challenging ... the entrance ...
       placed in front of the last floating platform".
     So: three stones, each 2.2 across, every hop STONES.gap (3.2 — a third of
     a single jump's reach, so the challenge is the landing, not the
     distance).
     · Then the first three were placed one at a time — one hop off the rim
       12° left of the straight line, one hop short of the gate on its axis,
       and the middle wherever was one hop from both — and the hops were
       equal but the WAY was not: it zigzagged, turning -55°, +62° and +61°,
       and the middle stone swung out sideways so the three sat 3.2, 7.8 and
       15.3 off the Dojo's rim with the deck at 17.6. Richard: "smooth out
       the placement of the three platforms leading up to the Dream Dojo so
       that they are more evenly spaced between the Dojo of the Turning
       Circle island and the Dream Dojo island."
     NOW ONE ARC. The four hops lie on a single circle that runs straight
     into the gate — tangent to the gate's axis at the deck's far end — so
     every turn is the same small turn (17°, 20°, 17°), and equal chords on a
     circle are equal hops by construction. Its radius is solved, not chosen:
     the one whose fourth hop lands on the Dojo's rim (~21). The stones now
     stand 3.0, 9.5 and 14.6 off the rim — even steps across the void — and
     the last is 0.7 off the gate's axis, so the gate is still the thing in
     front of her. world-check measures every hop, every turn, and the gate. */
  const gate = gateFrame(ARCADE, u, v, DOME_R);
  const span = 2 * STONES.r + STONES.gap;
  const hop0 = STONES.r + STONES.gap;
  const tip = gate.at(gate.tip);
  /** The four hops back from the gate's landing along a circle of radius
   *  `rho` tangent to its axis there, curving toward the Dojo: the three
   *  stones, and where the fourth lands (which should be the rim). */
  const arc = (rho) => {
    // The side the Dojo is on, across the gate's axis.
    const sg = Math.sign((dojoCentre.x - tip.x) * gate.lat.x + (dojoCentre.z - tip.z) * gate.lat.z) || 1;
    const c = { x: tip.x + gate.lat.x * rho * sg, z: tip.z + gate.lat.z * rho * sg };
    let a = Math.atan2(tip.z - c.z, tip.x - c.x);
    // Away from the gate is on out along its axis (`dir` points out of the
    // pad): which way round the circle that is.
    const turn = Math.sign(-Math.sin(a) * gate.dir.x + Math.cos(a) * gate.dir.z) || 1;
    const out = [];
    for (const ch of [hop0, span, span, hop0]) {
      a += turn * 2 * Math.asin(Math.min(1, ch / (2 * rho)));
      out.push({ x: c.x + Math.cos(a) * rho, z: c.z + Math.sin(a) * rho });
    }
    return out;
  };
  const rimErr = (rho) => {
    const p = arc(rho)[3];
    return Math.hypot(p.x - dojoCentre.x, p.z - dojoCentre.z) - STONES.rim;
  };
  // A tight circle lands the fourth hop inside the rim, a straight line
  // beyond it; bisect between the two.
  let lo = span;
  let hi = 4000;
  for (let i = 0; i < 80; i++) {
    const m = (lo + hi) / 2;
    if (rimErr(m) < 0) lo = m; else hi = m;
  }
  const [s3, s2, s1] = arc((lo + hi) / 2);
  const stones = [s1, s2, s3].map((s, k) => {
    const d = (s.x - dojoCentre.x) * u.x + (s.z - dojoCentre.z) * u.z;
    const w = (s.x - dojoCentre.x) * v.x + (s.z - dojoCentre.z) * v.z;
    return { x: s.x, z: s.z, y: STONES.y0 + STONES.rise * (k + 1), r: STONES.r, d, w };
  });
  /* WHERE A FALL PUTS HER BACK: on the Dojo, on the line from its centre to
     the first stone, LAUNCH_R out — "spawn them back to the start on the Dojo
     of the Turning Circle before they started jumping". */
  const s0 = stones[0];
  const k0 = LAUNCH_R / Math.hypot(s0.d, s0.w);
  const launch = {
    x: dojoCentre.x + (s0.x - dojoCentre.x) * k0, z: dojoCentre.z + (s0.z - dojoCentre.z) * k0,
  };
  /* THE DOOR in the dome is the gate: its bearing from the pad's centre. Only
     a kitten coming through it, low, on foot, is let in — see
     dream/approach.js — and only through it is she let out (the railing). */
  return {
    u, v, L,
    stones, launch, gate, door: gate.bearing,
    /* The tubes along the back of the pad, left to right in player order, so
       Tube 1 is on the left where Ember's score is. */
    tubes: [-7.5, -2.5, 2.5, 7.5].map((b) => at(6, b)),
    /* Lionheart on the left, near the way in, so he is the first thing a
       kitten meets stepping off the stones. */
    lion: at(-2, -9),
    sign: at(12.6, 0),
  };
}

/** What the minimap needs to draw the island (`Minimap._drawDream`), from a
 *  layout. Left on the World by `build`, so the map — which knows nothing of
 *  the Dream Dojo — can find it the same way it finds the islands. */
export function dreamSite(L) {
  return {
    x: ARCADE.x, z: ARCADE.z, r: ARCADE.r, dome: DOME_R,
    reach: L.gate.tip + 2,
    gate: L.gate.bearing,
    stones: L.stones.map((s) => ({ x: s.x, z: s.z, r: s.r })),
  };
}

/* ------------------------------ the lines -------------------------------- */

/**
 * What he says. `%n` is her name and `%t` her tube number.
 *
 * WORDED FOR HIS VOICE. He is Barrett (docs/notes/voices.md), picked as "the
 * smoothest and cool/confident anime sounding voice" with one warning
 * attached: "we don't want it to sound too seductive, so need to be careful
 * with the wording". So a smooth voice gets lines that are plainly about a
 * sword and a prize: "Like my sword?" was the old opener and is gone, and the
 * HONOR is something you EARN, not something he shares with you.
 *
 * AND NOBODY "JACKS" ANYTHING. Richard's call: "let's not use the term 'jacked
 * out' or 'jacking out' as it sounds inappropriate". She CONNECTS and
 * DISCONNECTS — here, on the prompts, on the sounds and in the comments, so
 * nobody copies the old word back in from a neighbour. world-check fails on
 * the word anywhere in src/ or the README.
 *
 * THE RECORDED ONES ARE `LION_VOICE`, below, and each is a render of exactly
 * this text with its newlines read as spaces. Change one here and its clip is
 * stale — tools/capture/lionheart-vo.mjs says how to re-cut it.
 */
export const LION_LINES = {
  idle: 'The Dream Dojo — VR training!\nJump across the stones\nand give it a try!',
  honor: 'See this sword? Her name is HONOR.\nBeat me in the simulator someday,\nand you\'ll earn a share of my HONOR!',
  send: '%n! Tube %t is yours.\nStep in and get ready!',
  sim: 'You\'re connected — welcome to my Dream Dojo!\nCross a bridge to an island to train.\nDone for now? Stand on your ring to disconnect.',
  simIdle: 'Everything in here is light.\nNothing you break in here\nis broken out there.',
  /* Said once per visit to a kitten wearing orbs. `%k` is how many. */
  rundown: '%n — you\'re wearing %k Kotodama!\nTalk to me for a rundown\nof what each one does.',
  /* The spokes in the order she meets them walking round from the port
     (dream/islands.js): +38 and +78 are on her left, -38 and -78 her right. */
  /* The improper way in — over the dome, or on a dragon. Shouted, and
     funny about it: he is overexcited, not cross. */
  yellWall: 'HEY! HEY HEY HEY! Not over the WALL!\nThat is the DISHONORABLE way in!\nThe front door is RIGHT THERE — through the GATE!',
  yellDrop: 'Did you just try to DROP into my dojo?!\nNo, no, NO! Down you slide!\nBack to the start, and jump the STONES like a true warrior!',
  islands: 'Left: GALLERY, RANGE, then KUDAMONO STORM.\nRight: TRIAL HALL, KATA, then the SINE GAUNTLET.\nStraight across: the ARENA SCHOOL.\nFar ones? LIGHT CYCLE! The farthest is my SHADOW.',
};

/* Which of those are recorded, and as what. `send` and `rundown` are not, and
   cannot be: they say a kitten's name and a number, and a recording can only
   say one of each. They stay text, like every line did before he had a voice. */
export const LION_VOICE = {
  idle: 'lion_idle',
  honor: 'lion_honor',
  sim: 'lion_sim',
  simIdle: 'lion_simidle',
  islands: 'lion_islands',
  /* `yellWall` IS A BUBBLE ONLY. Richard: "Lionheart's voice when the player
     tries to enter to the dojo by running into the wall with a dragon is not
     needed. It is not a good voice and is too loud and aggressive, so let's
     just not use it. We only need the 'dropping in' sound and that one
     already is working well." The take (lion_yell_wall) was recorded and
     deleted; it is in git history if he ever wants it back. */
  yellDrop: 'lion_yell_drop',
};

/* ------------------------------ shaders ---------------------------------- */

/* The sign: its canvas, scanlined, with a flicker and now and then a glitch
   that slides a band of it sideways — a projection, not a board. */
const SIGN_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const SIGN_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform float uTime;
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    float band = step(0.93, fract(sin(floor(uTime * 3.0) * 12.9898) * 43758.5453));
    float row = step(abs(uv.y - fract(uTime * 0.37)), 0.06);
    uv.x += band * row * 0.025;
    vec4 c = texture2D(map, uv);
    float scan = 0.82 + 0.18 * sin(vUv.y * 260.0 - uTime * 9.0);
    float sweep = smoothstep(0.0, 0.04, abs(fract(vUv.y - uTime * 0.25) - 0.5));
    c.rgb *= scan * (0.85 + 0.15 * sweep);
    c.rgb += vec3(0.25, 0.9, 1.0) * (1.0 - sweep) * 0.12 * c.a;
    gl_FragColor = vec4(c.rgb, c.a * uAlpha);
  }
`;

const SCREEN_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
/* THE PHASE. Digital rain in her pane only: columns of glyph cells falling at
   their own speeds, a scan band sweeping, and at full strength a white-cyan
   flash that is the moment she crosses. Procedural — the glyphs are a 3x5
   bit pattern picked per cell per tick — because there is no font texture in
   this game and a canvas of katakana for one effect is not worth its upload. */
const RAIN_FRAG = /* glsl */`
  uniform float uI;
  uniform float uTime;
  uniform vec2 uRes;
  varying vec2 vUv;
  float h(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 15731.743); }
  void main() {
    float cw = 14.0;
    vec2 px = vUv * uRes;
    vec2 cell = floor(px / vec2(cw, cw * 1.4));
    vec2 inCell = fract(px / vec2(cw, cw * 1.4));
    float speed = 6.0 + h(vec2(cell.x, 3.0)) * 14.0;
    float head = fract(h(vec2(cell.x, 7.0)) - uTime * speed / (uRes.y / (cw * 1.4)));
    float row = cell.y / (uRes.y / (cw * 1.4));
    float trail = fract(row - head);
    float lit = smoothstep(0.55, 0.0, trail);
    float tick = floor(uTime * 12.0 + h(cell) * 20.0);
    vec2 g = floor(inCell * vec2(3.0, 5.0));
    float bit = step(0.45, h(cell * 1.7 + g + tick * 0.13));
    float glyph = bit * step(0.12, inCell.x) * step(inCell.x, 0.88) * step(0.08, inCell.y) * step(inCell.y, 0.92);
    vec3 col = mix(vec3(0.1, 1.0, 0.6), vec3(0.6, 1.0, 1.0), step(0.97, 1.0 - trail));
    float a = glyph * lit * clamp(uI * 1.6, 0.0, 1.0);
    float scan = exp(-pow((vUv.y - fract(uTime * 0.7)) * 9.0, 2.0)) * uI;
    float veil = smoothstep(0.35, 1.0, uI);
    vec3 outc = col * a + vec3(0.4, 1.0, 0.95) * scan * 0.35;
    float flash = smoothstep(0.85, 1.0, uI);
    outc = mix(outc, vec3(0.85, 1.0, 1.0), flash * 0.75);
    float alpha = clamp(max(a, veil * 0.92) + scan * 0.2, 0.0, 1.0);
    vec3 bg = vec3(0.0, 0.05, 0.06);
    gl_FragColor = vec4(mix(bg, outc, clamp(a + flash + scan, 0.0, 1.0)) + outc * 0.2, alpha);
  }
`;

const SPRITE_VERT = /* glsl */`
  uniform mat3 uvTransform;
  varying vec2 vUv;
  varying vec2 vRaw;
  void main() {
    vRaw = uv;
    vUv = (uvTransform * vec3(uv, 1.0)).xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
/* HER, BEING DRAWN IN — OR OUT. `uRez` runs 0 to 1 as she arrives: rows of
   her pixels resolve from the top down out of a noise threshold, each with a
   bright cyan leading edge, and what has not resolved yet is a scatter of
   glyph-light where she will be. The same shader played backwards is her
   leaving. It samples HER sheet through HER sprite's own UV transform, so it
   is whichever cell she is actually showing — never a stand-in. */
const REZ_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform vec3 uTint;
  uniform float uRez;
  uniform float uTime;
  varying vec2 vUv;
  varying vec2 vRaw;
  float h(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  void main() {
    vec4 t = texture2D(map, vUv);
    if (t.a < 0.35) discard;
    vec2 blk = floor(vRaw * vec2(28.0, 56.0));
    float n = h(blk) * 0.35 + (1.0 - vRaw.y) * 0.65;
    float edge = uRez * 1.25 - n;
    if (edge < -0.12) {
      float sp = step(0.86, h(blk + floor(uTime * 14.0)));
      if (sp < 0.5) discard;
      gl_FragColor = vec4(0.4, 1.0, 0.9, 0.85);
      return;
    }
    vec3 col = t.rgb * uTint;
    float glow = 1.0 - smoothstep(0.0, 0.12, edge);
    col = mix(col, vec3(0.55, 1.0, 1.0), glow);
    gl_FragColor = vec4(col, 1.0);
  }
`;
/* AND ONCE SHE IS IN: a faint scanline glint over her, additive, so she reads
   as made of light like everything else in there without losing a single
   pixel of who she is. */
const GLINT_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform float uTime;
  varying vec2 vUv;
  varying vec2 vRaw;
  void main() {
    vec4 t = texture2D(map, vUv);
    if (t.a < 0.35) discard;
    float lines = 0.5 + 0.5 * sin(vRaw.y * 160.0 - uTime * 6.0);
    float sweep = exp(-pow((vRaw.y - fract(uTime * 0.45)) * 7.0, 2.0));
    vec3 c = vec3(0.2, 0.9, 1.0) * (lines * 0.10 + sweep * 0.35);
    gl_FragColor = vec4(c, 1.0);
  }
`;

const DOME_VERT = /* glsl */`
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vP;
  varying float vDist;
  void main() {
    vP = position;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vView = normalize(cameraPosition - wp.xyz);
    vDist = distance(cameraPosition, wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
/* A hex lattice that is only really there edge-on, plus a slow ripple from
   the top. Barely visible from inside, unmistakable from a dragon.
   FIRST CUT, REJECTED ON SIGHT: a square lattice with every other row
   shunted half a cell — which is a brick wall, and at full fresnel, with the
   follow camera sitting about on the shell (r 19 against a camera 15-20 back),
   the near side came out as an opaque orange wall across a third of the
   pane. So: a real hex cell, half the strength, and the shell fades to
   nothing within a few units of the lens, so the side you are looking
   THROUGH is never the side you see. */
const DOME_FRAG = /* glsl */`
  uniform float uTime;
  uniform float uHit;
  varying vec3 vN;
  varying vec3 vView;
  varying vec3 vP;
  varying float vDist;
  float hexEdge(vec2 q) {
    const vec2 r = vec2(1.0, 1.7320508);
    vec2 h = r * 0.5;
    vec2 a = mod(q, r) - h;
    vec2 b = mod(q - h, r) - h;
    vec2 gv = dot(a, a) < dot(b, b) ? a : b;
    vec2 p = abs(gv);
    float d = max(dot(p, vec2(0.5, 0.8660254)), p.x);
    return smoothstep(0.44, 0.5, d);
  }
  void main() {
    float f = pow(1.0 - abs(dot(normalize(vN), normalize(vView))), 2.6);
    float hex = hexEdge(vec2(atan(vP.z, vP.x) * 9.0, vP.y * 0.9));
    float ripple = exp(-pow((vP.y / 19.0) - fract(uTime * 0.25), 2.0) * 60.0);
    float near = smoothstep(3.0, 14.0, vDist);
    float a = (f * 0.16 + hex * f * 0.3 + ripple * hex * 0.18) * near
      + uHit * 0.45 * (0.3 + hex);
    gl_FragColor = vec4(vec3(0.35, 0.95, 1.0) * (0.6 + hex * 0.6 + uHit), a);
  }
`;

const TUBE_FRAG = /* glsl */`
  uniform float uTime;
  uniform vec3 uColor;
  uniform float uGlow;
  varying vec2 vUv;
  void main() {
    float streak = pow(0.5 + 0.5 * sin(vUv.x * 62.0 + sin(vUv.x * 9.0) * 2.0), 6.0);
    float rise = fract(vUv.y * 1.5 - uTime * (0.4 + uGlow * 1.2));
    float band = smoothstep(0.0, 0.05, rise) * (1.0 - smoothstep(0.08, 0.3, rise));
    float edge = smoothstep(0.85, 1.0, vUv.y) + smoothstep(0.12, 0.0, vUv.y);
    float a = 0.10 + streak * 0.12 * (0.4 + uGlow) + band * (0.15 + uGlow * 0.5) + edge * 0.35;
    gl_FragColor = vec4(uColor * (0.6 + uGlow), a);
  }
`;
const TUBE_VERT = /* glsl */`
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

/* ------------------------------ canvases --------------------------------- */

function canvasTexture(w, h, draw) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d', { willReadFrequently: false });
  draw(g, w, h);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function signTexture() {
  return canvasTexture(1024, 384, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(6, 18, 28, 0.82)';
    g.fillRect(10, 10, w - 20, h - 20);
    g.strokeStyle = '#5ff6ff';
    g.lineWidth = 8;
    g.strokeRect(14, 14, w - 28, h - 28);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '700 150px "Noto Serif JP", serif';
    g.fillStyle = '#ff4fd8';
    g.shadowColor = '#ff4fd8';
    g.shadowBlur = 24;
    g.fillText('夢道場', w / 2, 140);
    g.shadowColor = '#5ff6ff';
    g.font = '900 64px Nunito, sans-serif';
    g.fillStyle = '#c8fdff';
    g.fillText('THE DREAM DOJO', w / 2, 262);
    g.shadowBlur = 0;
    g.font = '700 34px Nunito, sans-serif';
    g.fillStyle = '#7fe9ff';
    g.fillText("LIONHEART'S VR ARCADE", w / 2, 324);
  });
}

/** Each seat's colour when nobody has dressed it yet — the HUD's own four. */
export const TUBE_COLOURS = [0xff8a3d, 0xff6fae, 0x35d7f0, 0xa96bff];

/** How near the holo-Lionheart a kitten in the sim must be to read his bubble
 *  (and to get his pitch at all). Further than this, his words go on the
 *  screen's own card instead — see `_captionHolo`. */
export const LION_NEAR = 20;

/** Where a bridge's gate sign stands on the hub: `back` in from the mouth
 *  (at 47), `side` across from its centre line, `up` off the floor; one
 *  reached through another island is `stack` higher, on the same post. */
export const GATE_SIGN = { back: 4, side: 7.5, up: 5.5, scale: 0.62, stack: 3.4 };
export function gateSignSpot(dc, dir, side = 1) {
  const r = 47 - GATE_SIGN.back;
  return {
    x: dc.x + dir.x * r - dir.z * GATE_SIGN.side * side,
    y: dc.y + GATE_SIGN.up,
    z: dc.z + dir.z * r + dir.x * GATE_SIGN.side * side,
  };
}
/** Who the caption card says is talking. */
export const LION_WHO = { name: 'LIONHEART', sub: 'Dream Dojo', colour: '#ff3b3b' };

/**
 * Which side of Lionheart his bubble goes, for a lens whose screen-right is
 * `right` (flat, unit): +1 his right, -1 his left.
 *
 * AWAY FROM THE TUBES. Richard: "Lionhearts text in the simulation is
 * blocking the 4 VR floating tubes both on the Dream Dojo island and in the
 * simulation." The bubble always went to his screen-right, and it is drawn
 * over everything (depthTest off, so it reads through the dome) — and from
 * the walking camera his four tubes ARE on his screen-right: he stands at
 * (-2, -9) on the pad, the tubes at (6, -7.5..7.5). A kitten reading him
 * could not see the tube she had been told to step into. The side is decided
 * per LENS (each pane turns its own bubbles), from where the tubes' middle is
 * against him; the sim's holo-Lionheart stands on the same spot relative to
 * the same tubes, so one answer serves both. Exported for world-check.
 */
export function lionBubbleSide(L, right) {
  let cx = 0; let cz = 0;
  for (const t of L.tubes) { cx += t.x / L.tubes.length; cz += t.z / L.tubes.length; }
  const d = (cx - L.lion.x) * right.x + (cz - L.lion.z) * right.z;
  return d > 0 ? -1 : 1;
}

function numberTexture(n, colour) {
  return canvasTexture(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '900 96px Nunito, sans-serif';
    g.shadowColor = colour;
    g.shadowBlur = 18;
    g.fillStyle = colour;
    g.fillText(String(n), w / 2, h / 2 + 4);
  });
}

const css = (hex) => `#${new THREE.Color(hex).getHexString()}`;

/* ------------------------------- system ---------------------------------- */

export class DreamDojo {
  constructor(game) {
    this.game = game;
    /** Player index -> her sequence state, or nothing at all if she has
     *  never been near a tube. The ABSENCE is the two-player guarantee. */
    this.st = [];
    this.t = 0;
    this.sim = null;
    this.simDojo = null;
    this.built = false;
    this._said = new Map();
    this._domeHit = 0;
    this._toastAt = new Map();
    /** The holograms a kitten's blade can find in here — see dream/targets.js. */
    this.gate = new TrainingGate();
    /** Stars, bests and flags, per kitten, for good. `localStorage` may throw
     *  just being READ in a locked-down frame, so it is asked inside a try. */
    let store = null;
    try { store = globalThis.localStorage ?? null; } catch { store = null; }
    this.progress = new DreamProgress(store);
    /** Player index -> her live drill, or nothing. */
    this.drills = [];
    /** Player index -> her open rundown, or nothing. */
    this.rundowns = [];
    /** Every pad in the simulator that answers INTERACT (pedestals, shrines). */
    this.stations = [];
    this._hintAt = new Map();
    /** His recorded lines, keyed by the very strings the bubbles show — so a
     *  card and its recording cannot be two different sentences. The audio is
     *  asked for late because the game builds it before this but a test
     *  harness may not build it at all. */
    this.voice = new LionVoice(() => game?.audio ?? null, [
      ...Object.entries(LION_VOICE).map(([k, id]) => [LION_LINES[k], id]),
      ...Object.values(SHADOW_LINES).map((l) => [l.line, l.voice]),
      [HANDOVER.line, HANDOVER.voice],
      ...Object.entries(GEAR_VOICE).map(([k, id]) => [GEAR_LINES[k], id]),
    ]);
  }

  /* ----------------------------- the island ------------------------------- */

  /**
   * Raise the island. Called once, after the World, with Lionheart's atlas.
   * Every collider it adds goes into the real World's own lists, so the real
   * World needs to know nothing about the arcade to be walked on.
   */
  build(lionArt) {
    const g = this.game;
    const W = g.world;
    if (!W || this.built) return;
    this.built = true;
    this.layout = arcadeLayout(W.dojoCentre);
    const L = this.layout;
    // For the minimap, which is built after this (see `dreamSite`).
    W.dreamDojo = dreamSite(L);
    this.group = new THREE.Group();
    this.group.name = 'dream-dojo';
    g.scene.add(this.group);

    /* The pad and the stones are PLATFORMS with a round deck — the shrine
       dais's shape — so `World.heightAt` already knows how to stand a kitten
       on them, one-way from below, and a dragon finds no island under them
       (`island: null`), which is half of why it never lands here. */
    const plat = (x, z, r, y, extra = {}) => {
      const p = { x0: x - r, x1: x + r, z0: z - r, z1: z + r, y, cx: x, cz: z, r, arcade: true, ...extra };
      W.platforms.push(p);
      return p;
    };
    this.padDeck = plat(ARCADE.x, ARCADE.z, ARCADE.r, ARCADE.y, { step: 0.6 });
    this.approach = new Approach(this, { arcade: ARCADE, domeR: DOME_R });
    this.lecture = new Lecture(this);
    for (const s of L.stones) plat(s.x, s.z, s.r, s.y, { step: 0.6 });
    // The deck, the torii and the railing (dream/gate.js).
    this.gateFx = buildGate(this.group, L.gate, ARCADE, plat);

    const parts = [];
    // The pad: a steel drum with a darker inset, on a ragged rock.
    const drum = new THREE.CylinderGeometry(ARCADE.r, ARCADE.r * 0.96, 1.4, 48);
    drum.translate(ARCADE.x, ARCADE.y - 0.7, ARCADE.z);
    parts.push(paint(drum, 0x4a5068));
    const inset = new THREE.CylinderGeometry(ARCADE.r - 1.2, ARCADE.r - 1.2, 0.08, 48);
    inset.translate(ARCADE.x, ARCADE.y + 0.01, ARCADE.z);
    // Not darker than this: at 0x1a1c26 the deck read as a hole in the world.
    parts.push(paint(inset, 0x323a52));
    // ROCK is what `animalContact` keeps a dragon out of: the same numbers.
    const rock = new THREE.ConeGeometry(ROCK.r, ROCK.h, 10, 2);
    rock.rotateX(Math.PI);
    rock.translate(ARCADE.x, ARCADE.y - ROCK.top - ROCK.h / 2, ARCADE.z);
    parts.push(paint(rock, 0x5a4a52));
    for (const s of L.stones) {
      const top = new THREE.CylinderGeometry(s.r, s.r * 0.9, 0.6, 14);
      top.translate(s.x, s.y - 0.3, s.z);
      parts.push(paint(top, 0x3a3f52));
      const under = new THREE.ConeGeometry(s.r * 0.9, 3.4, 7);
      under.rotateX(Math.PI);
      under.translate(s.x, s.y - 0.6 - 1.7, s.z);
      parts.push(paint(under, 0x5a4a52));
    }
    // Tube bases and caps, the hard parts of the four tubes.
    for (const t of L.tubes) {
      const base = new THREE.CylinderGeometry(TUBE_R + 0.35, TUBE_R + 0.5, 0.3, 28);
      base.translate(t.x, ARCADE.y + 0.15, t.z);
      parts.push(paint(base, 0x3b4152));
      const cap = new THREE.CylinderGeometry(TUBE_R + 0.45, TUBE_R + 0.3, 0.5, 28);
      cap.translate(t.x, ARCADE.y + 5.4, t.z);
      parts.push(paint(cap, 0x3b4152));
    }
    const hard = new THREE.Mesh(mergeParts(parts), toonVertexMat());
    hard.castShadow = true;
    hard.receiveShadow = true;
    this.group.add(hard);

    // The pad's neon rim, and a rim on each stone, so the way across glows.
    const neon = (x, y, z, r, w, colour) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, w, 6, 64), new THREE.MeshBasicMaterial({ color: colour, toneMapped: false }));
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z);
      this.group.add(m);
      return m;
    };
    neon(ARCADE.x, ARCADE.y + 0.04, ARCADE.z, ARCADE.r - 0.15, 0.12, HOLO.cyan);
    neon(ARCADE.x, ARCADE.y + 0.04, ARCADE.z, ARCADE.r - 1.25, 0.06, HOLO.magenta);
    for (const s of L.stones) neon(s.x, s.y + 0.02, s.z, s.r - 0.1, 0.07, HOLO.cyan);

    /* THE DOME. Drawn from both sides and never written to depth, so a
       kitten inside it sees the island and not a wall. */
    this.domeU = { uTime: { value: 0 }, uHit: { value: 0 } };
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(DOME_R, 48, 20, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.ShaderMaterial({
        vertexShader: DOME_VERT, fragmentShader: DOME_FRAG, uniforms: this.domeU,
        transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
      })
    );
    dome.position.set(ARCADE.x, ARCADE.y - 0.5, ARCADE.z);
    dome.renderOrder = 6;
    this.group.add(dome);
    this.dome = dome;

    /* THE TUBES. Glass that streams light upward, faster and brighter while
       somebody is in it, in HER colour once she is. */
    this.tubeU = [];
    this.tubeMats = L.tubes.map((t, i) => {
      const u = {
        uTime: { value: 0 }, uGlow: { value: 0 },
        uColor: { value: new THREE.Color(HOLO.cyan) },
      };
      this.tubeU.push(u);
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(TUBE_R, TUBE_R, 5.0, 32, 1, true),
        new THREE.ShaderMaterial({
          vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG, uniforms: u,
          transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        })
      );
      glass.position.set(t.x, ARCADE.y + 2.8, t.z);
      glass.renderOrder = 5;
      this.group.add(glass);
      const col = g.players?.[i]?.style?.colour ?? TUBE_COLOURS[i];
      const num = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 1.3),
        new THREE.MeshBasicMaterial({ map: numberTexture(i + 1, css(col)), transparent: true, depthWrite: false, toneMapped: false })
      );
      num.position.set(t.x, ARCADE.y + 6.5, t.z);
      num.renderOrder = 7;
      this.group.add(num);
      return { glass, num };
    });

    /* THE SIGN IS A HOLOGRAM NOW, AND HAS NO POSTS. Richard: "Seems The
       Dream Dojo sign, the billboard is behind the poles holding it up. Since
       this is a hologram dojo, maybe we can just remove the poles ... If it is
       floating, have it bouncing around and fading in/out a bit to look more
       holographic." It was a camera-facing plane between two posts at ±5.2
       on the same spot, so as the plane turned to the lens the posts came in
       front of it from most of the angles a kitten walks up at. Now it is
       projected: a puck on the deck, a faint cone of light, and the board
       floating in it — bobbing, swaying a little, scanlined and flickering
       (`SIGN_FRAG`; `_updateSign` drives it). */
    this.signU = { map: { value: signTexture() }, uTime: { value: 0 }, uAlpha: { value: 0.92 } };
    const sign = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 4.5),
      new THREE.ShaderMaterial({
        vertexShader: SIGN_VERT, fragmentShader: SIGN_FRAG, uniforms: this.signU,
        transparent: true, depthWrite: false, side: THREE.DoubleSide,
      })
    );
    sign.position.set(L.sign.x, ARCADE.y + SIGN_Y, L.sign.z);
    sign.renderOrder = 12;
    this.sign = sign;
    this.group.add(sign);
    const puck = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.35, 24), new THREE.MeshBasicMaterial({ color: 0x2a3042 }));
    puck.position.set(L.sign.x, ARCADE.y + 0.18, L.sign.z);
    this.group.add(puck);
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.8, 24), new THREE.MeshBasicMaterial({ color: HOLO.cyan, toneMapped: false }));
    lens.rotation.x = -Math.PI / 2;
    lens.position.set(L.sign.x, ARCADE.y + 0.37, L.sign.z);
    this.group.add(lens);
    const cone = new THREE.Mesh(
      new THREE.CylinderGeometry(4.6, 0.75, SIGN_Y - 2.3, 24, 1, true),
      new THREE.MeshBasicMaterial({
        color: HOLO.cyan, transparent: true, opacity: 0.07, depthWrite: false,
        blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
      })
    );
    cone.position.set(L.sign.x, ARCADE.y + 0.37 + (SIGN_Y - 2.3) / 2, L.sign.z);
    this.signCone = cone;
    this.group.add(cone);

    /* THE GEAR ROOM: the VR-dojo props, the three racks a first-timer is sent
       round, the lasers and the suit-up poof (dream/gear.js). */
    const atPad = (a, b) => ({ x: ARCADE.x + L.u.x * a + L.v.x * b, z: ARCADE.z + L.u.z * a + L.v.z * b });
    this.gear = new GearRoom(this, this.group, atPad, ARCADE);

    this._buildLion(lionArt);
  }

  /** Lionheart: Payne's billboard pattern, with his own bubble. */
  _buildLion(art) {
    const g = this.game;
    const L = this.layout;
    this.lion = new THREE.Group();
    this.lion.position.set(L.lion.x, ARCADE.y, L.lion.z);
    this.lionArt = art?.texture ? art : null;
    if (art?.texture) {
      const quad = LION_HEIGHT / (art.contentScale || 1);
      /* FRONT-FACING, NEVER MIRRORED: one drawing with a sword over ONE
         shoulder must not swap shoulders as the camera walks round him. */
      this.lionSprite = new Billboard(art.texture, {
        cols: 1, rows: 1, width: quad, height: quad, footOffset: (art.pad ?? 0) * quad, mirror: false,
      });
      this.lion.add(this.lionSprite);
    }
    const sg = new THREE.CircleGeometry(1.5, 18);
    sg.rotateX(-Math.PI / 2);
    const shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({ color: 0x0a0c14, transparent: true, opacity: 0.4, depthWrite: false }));
    shadow.position.y = 0.05;
    this.lion.add(shadow);
    this.group.add(this.lion);
    g.world?.solids?.push({ x: L.lion.x, z: L.lion.z, r: 1.25 });
    this.bubbles = new Map();
    this.bubbleKey = null;
    this.bubbleShow = 0;
  }

  /** His bubble for `text`: a PAIR, one to hang on each side of him, since
   *  the side is chosen per lens (`lionBubbleSide`). `on` is whether it is
   *  showing at all; `faceCamera` shows the half for the lens it is drawing. */
  _bubble(text, holo = false) {
    const map = holo ? this.holoBubbles : this.bubbles;
    let m = map.get(text);
    if (m) return m;
    const make = (tail) => {
      const { texture, aspect, tip } = bubbleTexture(text, '#ff3b3b', { tail });
      const BH = 3.0;
      const b = new THREE.Mesh(new THREE.PlaneGeometry(BH * aspect, BH), new THREE.MeshBasicMaterial({
        map: texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
        toneMapped: false, side: THREE.DoubleSide,
      }));
      b.userData.w = BH * aspect;
      b.userData.tipY = BH * (0.5 - tip.v);
      b.renderOrder = 24;
      b.visible = false;
      (holo ? this.holoLion : this.lion).add(b);
      return b;
    };
    // `r` hangs on his right with its tail pointing left at him; `l` the mirror.
    m = { r: make('left'), l: make('right'), on: false };
    map.set(text, m);
    return m;
  }

  /** One bubble pair, shown for this lens on the side away from the tubes. */
  _turnBubble(m, camera) {
    const s = lionBubbleSide(this.layout, _right);
    const b = s > 0 ? m.r : m.l;
    m.r.visible = m.on && s > 0;
    m.l.visible = m.on && s < 0;
    if (!m.on) return;
    b.quaternion.copy(camera.quaternion);
    const off = s * (1.4 + (b.userData.w ?? 4) * 0.5);
    b.position.x = _right.x * off;
    b.position.z = _right.z * off;
  }

  /** Have the HOLOGRAM say something — the one a kitten in the sim can see.
   *  Aloud too, if the line is a recorded one; the card then stays up until he
   *  has finished, since the islands line alone runs nineteen seconds. */
  holoSay(text, secs = 6) {
    this.voice.load();
    const d = this.voice.speak(text, this.t);
    this.holoText = text;
    this.holoUntil = this.t + Math.max(secs, d > 0 ? d + VOICE_TAIL : 0);
  }

  /** Have him say something for a while — aloud if it is a recorded line, and
   *  as a bubble regardless, which is all a line with a name in it can be. */
  say(text, secs = 6) {
    this.voice.load();
    const d = this.voice.speak(text, this.t);
    this.sayText = text;
    this.sayUntil = this.t + Math.max(secs, d > 0 ? d + VOICE_TAIL : 0);
  }

  /** HE SAW THAT. Richard: "If players try to enter this way, we can have
   *  Lionheart in a funny and overly excited and berating way, yell at the
   *  players for being dishonorable and trying to enter the 'improper way'."
   *  One line per kind of attempt; the dome's own gate decides how often
   *  (`Approach._yell`, ten seconds), and nobody else talking keeps him quiet
   *  but leaves the bubble — `say` already knows that. */
  yell(kind, p) {
    if (!this.lion) return;
    if (this.t - (this._yellAt ?? -99) < 8) return;
    this._yellAt = this.t;
    this.say(kind === 'drop' ? LION_LINES.yellDrop : LION_LINES.yellWall, 6);
  }

  /** An AMBIENT line: voiced only when `LionVoice` says it is time (it gates
   *  on the gaps and on anybody else talking), and when it IS voiced the
   *  bubble is pinned to it for the clip — the nine-second swap between his
   *  two ambient cards would otherwise change the words under his voice. */
  _ambient(text, holo) {
    this.voice.load();
    const d = this.voice.speak(text, this.t, { ambient: true });
    if (d <= 0) return;
    if (holo) { this.holoText = text; this.holoUntil = this.t + d + VOICE_TAIL; }
    else { this.sayText = text; this.sayUntil = this.t + d + VOICE_TAIL; }
  }

  /* ------------------------------- queries -------------------------------- */

  /** Which reality is she in? `'sim'` or `null`. */
  realmOf(p) { return p?.realm === 'sim' ? 'sim' : null; }

  /** The world she walks on. */
  worldFor(p) { return this.realmOf(p) === 'sim' && this.sim ? this.sim : this.game.world; }

  /** Is anybody in, or on the way in or out? */
  get busy() { return this.st.some((s) => s && s.phase); }

  /** Her state, if she has any. */
  stateOf(i) { return this.st[i] ?? null; }

  /** Is a pane full of sim? A group's realm is its first member's — a group
   *  never mixes realms, `Game._clusters` sees to that. */
  paneIsSim(members) {
    const p = this.game.players?.[members?.[0]];
    return !!p && this.realmOf(p) === 'sim';
  }

  /** Does she want a pane of her own? From the moment she sets off for her
   *  tube, so the phase never washes over a sister's view. */
  wantsSolo(p) {
    const s = this.st[p?.index];
    return !!(s && s.phase) || this.realmOf(p) === 'sim';
  }

  /**
   * Who her panda follows while she is in: HER, standing on the Dojo's rim
   * at the foot of the stones. The dome keeps it off the pad, so the honest
   * place for it to wait is the last bit of ground before the jump — which is
   * also exactly where she will see it when she comes out.
   *
   * A REAL `Proxy`, NOT `Object.create`. The panda writes to its owner (a
   * lick heals her, a mount sets her seat), and a prototype copy would take
   * every one of those writes on itself and quietly lose them. Only
   * `position` is answered differently; everything else is her.
   */
  ownerFor(p) {
    if (this.realmOf(p) !== 'sim' || !this.layout) return p;
    const s = this.st[p.index];
    if (!s) return p;
    if (!s.proxy) {
      /* At the take-off for the first stone since the way across curved:
         the old spot, 61 out along the straight line, is no longer "the foot
         of the stones". */
      const dc = this.game.world.dojoCentre;
      const at = this.layout.launch;
      const wait = new THREE.Vector3(at.x, dc.y, at.z);
      s.proxy = new Proxy(p, {
        get: (t, k) => (k === 'position' ? wait : Reflect.get(t, k)),
      });
    }
    return s.proxy;
  }

  /** The pad she is driven by: her own, a dead one, or the walk to her tube. */
  padFor(i, pad, dead) {
    const s = this.st[i];
    if (!s?.phase) return pad;
    if (s.phase === 'walk' || s.phase === 'walkout') return s.walkPad ?? dead;
    if (s.phase === 'sim') {
      // On a light cycle she is cargo: a stick still pushed must not steer
      // her off the highway (highway.js).
      if (this.highway?.riding(i)) return dead;
      /* A DRILL MAY WATCH HER BUTTONS — Kata Trace has to know the moment
         she pressed jump, not the moment her feet left the floor. Watching
         only: `pressed` is a pure edge test, and this never consumes one. */
      const d = this.drills[i];
      if (d?.state === 'live') d.spec.pad?.(d, pad);
      return pad;
    }
    return dead;
  }

  /** Is she standing at Lionheart? */
  canTalk(p) {
    if (!this.lion || !p) return false;
    if (p.mount || p.rideAlong || p.pandaMount || p.angel || p.carried || p.ko) return false;
    if (this.st[p.index]?.phase && this.st[p.index].phase !== 'sim') return false;
    const pos = this._flatPos(p);
    return Math.hypot(pos.x - this.lion.position.x, pos.z - this.lion.position.z) < LION_TALK_R;
  }

  /** In the sim, positions are compared in the layer's own coordinates, so
   *  holo-Lionheart answers at the same spot the real one stands on. */
  _flatPos(p) {
    if (this.realmOf(p) !== 'sim') return p.position;
    return { x: p.position.x - SIM.dx, z: p.position.z - SIM.dz };
  }

  /** Index of the tube she is standing in (real world, on foot), or -1. */
  tubeAt(p) {
    if (!this.layout || this.realmOf(p) === 'sim') return -1;
    for (let i = 0; i < this.layout.tubes.length; i++) {
      const t = this.layout.tubes[i];
      if (Math.hypot(p.position.x - t.x, p.position.z - t.z) < TUBE_IN
        && Math.abs(p.position.y - ARCADE.y) < 1.2) return i;
    }
    return -1;
  }

  /** In the sim, is she on her own port ring? */
  onPort(p) {
    if (this.realmOf(p) !== 'sim' || !this.layout) return false;
    const t = this.layout.tubes[p.index];
    const q = this._flatPos(p);
    return !!t && Math.hypot(q.x - t.x, q.z - t.z) < TUBE_IN && Math.abs(p.position.y - ARCADE.y) < 1.2;
  }

  /** Why she cannot go in right now, as an instruction — or null. */
  _refusal(p) {
    const g = this.game;
    if (g.tournament?.active) return 'the tournament is on — come back after the round';
    if (g._sceneActive?.() || g._finaleDue) return 'wait for the story to finish';
    if (p.mount || p.rideAlong || p.pandaMount) return 'hop off first';
    return null;
  }

  /** What her prompt should say, or null. Read by `Game._updateClanPrompt`. */
  prompt(p, key) {
    if (!this.layout || !key) return null;
    const s = this.st[p.index];
    if (s?.phase && s.phase !== 'sim') return null;
    if (this.realmOf(p) === 'sim') {
      if (this.highway?.riding(p.index)) return null;
      if (this.onPort(p)) return `[${key}]  DISCONNECT`;
      // The card says which button turns it; a callout under it is the same
      // words a second time, drawn on top of its last line.
      if (this.rundowns[p.index]) return null;
      if (this.canTalk(p)) {
        return p.powerOrbs?.length ? `[${key}]  RUNDOWN OF YOUR KOTODAMA` : `[${key}]  TALK TO LIONHEART`;
      }
      const st = this.stationAt(p);
      return st ? st.prompt(p, key) : null;
    }
    if (this.canTalk(p)) {
      if (p.simLook) return `[${key}]  TRAIN WITH LIONHEART`;
      if (p.dreamGeared) return `[${key}]  SUIT UP`;
      return s?.gather ? `[${key}]  WHAT GEAR DO I NEED?` : `[${key}]  GET YOUR VR GEAR`;
    }
    /* At a lit rack she has only to walk in; the toast is the confirmation. */
    const rack = s?.gather && this.gear?.rackAt(p, 2);
    if (rack && s.gather.has(rack)) return `PICKING UP THE ${GEAR_ITEMS.find((x) => x.id === rack).name}…`;
    const k = this.tubeAt(p);
    if (k < 0) return null;
    if (k !== p.index) {
      const owner = this.game.players?.[k];
      return owner ? `TUBE ${k + 1} IS ${owner.name.toUpperCase()}'S — YOURS IS ${p.index + 1}`
        : `YOUR TUBE IS NUMBER ${p.index + 1}`;
    }
    // The refusal said BEFORE the press, as an instruction (non-negotiable 6).
    if (!p.simLook) return 'SUIT UP FIRST — TALK TO LIONHEART';
    return `[${key}]  CONNECT`;
  }

  /**
   * She pressed INTERACT. Returns true when the arcade answered it — and it
   * always answers in words when it says no (non-negotiable 6).
   */
  interact(p) {
    if (!this.layout || !p) return false;
    const g = this.game;
    const s = this.st[p.index];
    if (s?.phase && s.phase !== 'sim') return false;
    if (this.realmOf(p) === 'sim') {
      // Swallowed, not refused: a press mid-ride is her hand still on the
      // button she rode off with, and it must not reach anything else.
      if (this.highway?.riding(p.index)) return true;
      if (this.onPort(p)) { this._begin(p, 'derez'); return true; }
      const rd = this.rundowns[p.index];
      if (rd) {
        if (!rd.next()) this._closeRundown(p);
        return true;
      }
      if (this.canTalk(p)) {
        if (p.powerOrbs?.length) this._openRundown(p);
        else this.holoSay(LION_LINES.islands, 8);
        g.sfx?.('menu');
        return true;
      }
      const st = this.stationAt(p);
      if (st) {
        st.interact(p);
        g.sfx?.('menu');
        return true;
      }
      return false;
    }
    const talk = this.canTalk(p);
    const k = this.tubeAt(p);
    if (!talk && k < 0) return false;
    const why = this._refusal(p);
    if (why) {
      g.sfx?.('deny');
      g.toast?.(`${p.name} — ${why}`, p.index);
      return true;
    }
    if (talk) {
      g.sfx?.('menu');
      // The headset drawings start down the wire now, behind the walk round the racks.
      g.loadSimArt?.();
      /* SUITED ALREADY (she took the stick back on the walk): straight to
         her tube. */
      if (p.simLook) {
        this.say(LION_LINES.send.replace('%n', p.name).replace('%t', String(p.index + 1)), 5);
        this._begin(p, 'walk');
        return true;
      }
      /* "After that, they can just go to Lionheart and they will poof into
         their equipment without needing to gather it again." */
      /* `p.dreamGeared`, A FACT ABOUT THIS GAME. It was a flag in the Dream
         Dojo's own store, beside her stars, which outlives every game — and
         Richard: "when talking to Lionheart, he just suits you up right away
         rather than making you grab the gear, even on a brand new game. Are
         these states being saved independently of a new game?" They were.
         Now it is on the kitten, saved in her row (savegame.js `castRow`),
         and a new game starts without it. */
      if (p.dreamGeared) {
        this.say(GEAR_LINES.again, 4);
        this._begin(p, 'suit');
        return true;
      }
      /* THE FIRST TIME: round the racks. "the players need to talk to
         Lionheart first to gather their equipment to go into VR for the
         first time." The racks light for her, and the toast says what. */
      const s = (this.st[p.index] ??= { phase: null, t: 0 });
      s.gather ??= new Set(GEAR_ITEMS.map((x) => x.id));
      this.say(GEAR_LINES.first, 7);
      g.toast?.(`${p.name} — collect your VR gear from the glowing racks: `
        + `${GEAR_ITEMS.filter((x) => s.gather.has(x.id)).map((x) => x.name).join(', ')}`, p.index);
      return true;
    }
    if (k !== p.index) {
      g.sfx?.('deny');
      g.toast?.(`${p.name} — your tube is number ${p.index + 1}`, p.index);
      return true;
    }
    /* NO GEAR, NO SIMULATOR — and it says where the gear is. */
    if (!p.simLook) {
      g.sfx?.('deny');
      g.toast?.(`${p.name} — talk to Lionheart first: he has your VR gear!`, p.index);
      this.say(GEAR_LINES.talk, 4);
      return true;
    }
    this._begin(p, 'rise');
    return true;
  }

  /* ----------------------------- the sequence ----------------------------- */

  _begin(p, phase) {
    /* THE HEADSET DRAWINGS START LOADING HERE, at the first walk to a tube or
       the first rise, and not at boot: six megabytes of turnaround nobody needs
       until somebody connects, and the walk plus the 1.8s rise covers it. */
    this.game.loadSimArt?.();
    const i = p.index;
    const s = (this.st[i] ??= { phase: null, t: 0 });
    s.phase = phase;
    s.t = 0;
    const tube = this.layout.tubes[i];
    s.base = new THREE.Vector3(tube.x, ARCADE.y, tube.z);
    if (phase === 'rise') {
      this._ensureSim();
      p.pinnedAt = p.position.clone();
      s.from = p.position.clone();
      this.game.sfx?.('visor');
      /* NO VISOR PLANE, AT ALL. It was a quad stood in front of her face, and
         Richard: "The VR headset overlay over the players characters face ...
         does not align very well with their eyes when they are moving
         around". The suit-up made it a fallback for a build whose sheet never
         loaded, and then: "Since player is suiting up in the VR Arcade, no
         longer need to place the 3D VR headset infront of their face on the
         dream dojo island." So it is gone, on her and on her puppet. A build
         with no headset sheet shows her in her own clothes, which is a
         drawing that is right rather than a plane that is wrong. */
    }
    if (phase === 'suit' || phase === 'unsuit') {
      p.pinnedAt = p.position.clone();
      p.velocity?.set?.(0, 0, 0);
      s.poofed = false;
      s.dressed = false;
    }
    if (phase === 'walkout') {
      /* OUT OF THE TUBE ON HER OWN LEGS: "When exiting the VR, they should
         automatically walk out of the tube, and poof with special effects to
         put their regular clothes back on." Toward the middle of the pad,
         three units — clear of the glass, still in front of her tube. */
      const dx = ARCADE.x - tube.x;
      const dz = ARCADE.z - tube.z;
      const d = Math.hypot(dx, dz) || 1;
      s.outTo = new THREE.Vector3(tube.x + (dx / d) * 3.2, ARCADE.y, tube.z + (dz / d) * 3.2);
    }
    if (phase === 'derez') {
      const port = toSim(tube.x, tube.z);
      s.from = p.position.clone();
      s.to = new THREE.Vector3(port.x, ARCADE.y + FLOAT_H, port.z);
      p.pinnedAt = p.position.clone();
      this.game.sfx?.('disconnect');
      this._hushHolo(p);
    }
  }

  /**
   * SHE HAS LEFT, SO HE STOPS TALKING — if nobody is left in there to hear
   * him. Called on the DISCONNECT press (the 1.1s de-rez is her already
   * leaving) and again from `_leaveSim`, which every way out runs through:
   * the tournament, a scene, the ending, a kitten dropping out of the game.
   * Only the HOLOGRAM's lines: the real Lionheart's two at the arcade are
   * said in the reality she is going back to. A sister still inside keeps
   * him — he is talking to her too.
   */
  _hushHolo(leaving) {
    const others = this.simKittens().filter((q) => q !== leaving && this.st[q.index]?.phase !== 'derez');
    if (others.length) return;
    const real = new Set([LION_VOICE.idle, LION_VOICE.honor]);
    if (!this.voice.hush((id) => !real.has(id))) return;
    this.holoUntil = 0;
    if (this.shadow) this.shadow.sayT = 0;
  }

  /** Build the simulator the first time anybody goes in, under the rain. */
  _ensureSim() {
    if (this.sim) return;
    const g = this.game;
    const dc = g.world.dojoCentre;
    this.sim = new SimWorld(g.scene, {
      dojo: { x: dc.x, y: dc.y, z: dc.z },
      arcade: ARCADE,
      ports: this.layout.tubes,
    });
    this.sim.onFall = (p) => this._onFall(p);
    /* THE REAL MATHDOJO, a second time, on the holo-Dojo's floor. Its own
       instance so the two circles each follow their own kittens — a sister
       walking the real circle must not steer the angle in here. */
    const c = new THREE.Vector3(dc.x + SIM.dx, dc.y, dc.z + SIM.dz);
    this.simDojo = new MathDojo(g.scene, c, { compact: !!g.device?.touchPrimary });
    // Holographic: the dark floor goes glassy so the grid deck shows through.
    this.simDojo.group.traverse((o) => {
      if (o.isMesh && o.material?.color && o.material.opacity === 0.88) {
        o.material.color.set(0x05202c);
        o.material.opacity = 0.55;
      }
    });
    // ...and the rest of it in light: see dream/holodojo.js.
    this.simDojoFx = holoDojo(this.simDojo);
    this._buildHoloLion();
    this._buildSimTubes();
    this.shards = new Shards(this.sim.root);
    this.simHud = makeSimHud(g, this);
    /* THE TRAINING ISLANDS, raised with the layer — under the rain, on the
       first connection, like the rest of it. */
    this.isles = {};
    this.highway = new DataHighway(this);
    for (const key of ['gallery', 'hall', 'range', 'kata', 'storm', 'sine', 'sentries', 'bamboo', 'school', 'shadow']) {
      this.isles[key] = this._raiseIsland(key);
    }
    this.gallery = new Gallery(this, this.isles.gallery);
    this.hall = new TrialHall(this, this.isles.hall);
    this.range = new TameshigiriRange(this, this.isles.range);
    this.kata = new KataHall(this, this.isles.kata);
    this.storm = new KudamonoStorm(this, this.isles.storm);
    this.sine = new SineGauntlet(this, this.isles.sine);
    this.sentries = new HoloSentries(this, this.isles.sentries);
    this.bamboo = new BambooInfiltration(this, this.isles.bamboo);
    this.school = new ArenaSchool(this, this.isles.school);
    this.ranks = new Ranks(this, this.isles.school);
    this.shadow = new ShadowFight(this, this.isles.shadow);
    this.stations = [...this.gallery.stations, ...this.hall.stations,
      ...this.range.stations, ...this.kata.stations,
      ...this.storm.stations, ...this.sine.stations,
      ...this.sentries.stations, ...this.bamboo.stations,
      ...this.school.stations, ...this.ranks.stations, ...this.shadow.stations,
      ...this.highway.stations];
  }

  /**
   * One island off the holo-Dojo: its deck, a data bridge from the Dojo's
   * rim, and its name over it. Returns where it is, in the layer, with `fwd`
   * pointing from the bridge across the island.
   */
  _raiseIsland(key) {
    const spec = ISLANDS[key];
    const dc = this.game.world.dojoCentre;
    const c = islandCentre(dc, this.layout.u, spec);
    this.sim.addDisc({ x: c.x, z: c.z, r: spec.r, y: c.y, name: key, grid: 2 });
    /* FROM THE HUB, or from the far rim of the island in front of it. The
       Shadow is straight on past the Arena School, and a road from the hub
       would run across the school's floor — `world-check` refuses any
       crossing that touches an island it does not end on. */
    const prev = spec.from ? this.isles[spec.from] : null;
    const from = prev
      ? { x: prev.x + c.dir.x * (prev.r - 2), z: prev.z + c.dir.z * (prev.r - 2), y: prev.y }
      : { x: dc.x + c.dir.x * 47, z: dc.z + c.dir.z * 47, y: dc.y };
    const to = { x: c.x - c.dir.x * (spec.r - 2), z: c.z - c.dir.z * (spec.r - 2), y: c.y };
    // The far islands are a DATA HIGHWAY instead — still a walkable bridge,
    // with a light cycle at each end (highway.js).
    if (spec.cycle) this.highway.add(key, spec.name, from, to, prev ? ISLANDS[spec.from].name : undefined);
    else this.sim.addBridge(from, to, { wobble: 3, waves: 1, name: `${key} bridge` });
    const sign = this.sim.addSign(c.x + c.dir.x * (spec.r - 2), c.y + 12, c.z + c.dir.z * (spec.r - 2), spec.kanji, spec.name);
    const gate = this._gateSign(key);
    return { key, x: c.x, y: c.y, z: c.z, r: spec.r, fwd: c.dir, sign, gate };
  }

  /**
   * THE SAME SIGN AT THE HUB END. Richard: "Lets have every area's/islands
   * signage and text in the simulation also be at the entrance of the bridge
   * in the main simulation island where the dojo of the turning circle is,
   * as well as having it on the island it belongs to."
   *
   * Every island's own sign hangs over its far rim, 128 to 330 units out, so
   * from the hub it was a smudge of pink over a disc — and the hub is where
   * the choosing happens. So each bridge mouth on the hub carries its
   * island's name too: beside the mouth, not over it, because the bridge
   * camera looks down the bridge from behind her and a sign over the deck
   * would be the first thing between her and the island it names. Smaller
   * than the island's own, and low, at a kitten's eye line.
   *
   * An island reached THROUGH another (the Shadow, past the Arena School)
   * has no mouth on the hub, so its sign is stacked over the sign of the
   * mouth it is reached by, saying so — a signpost. Across the mouth was
   * tried first and stood 7.8 from the Holo-Sentries' sign, the next spoke
   * round: the far spokes are only 30 degrees apart.
   */
  _gateSign(key) {
    const spec = ISLANDS[key];
    let via = key;
    let hops = 0;
    while (ISLANDS[via].from) { via = ISLANDS[via].from; hops++; }
    const dc = this.game.world.dojoCentre;
    const c = islandCentre(dc, this.layout.u, ISLANDS[via]);
    const at = gateSignSpot(dc, c.dir, 1);
    return this.sim.addSign(at.x, at.y + hops * GATE_SIGN.stack, at.z, spec.kanji, spec.name, HOLO.cyan,
      { scale: GATE_SIGN.scale, sub: hops ? `past the ${ISLANDS[via].name}` : '' });
  }

  /**
   * Every mouth of every bridge in the layer, as the look across wants it:
   * where the deck starts (world coordinates, as the roads are), which way
   * it runs from there, and the floor of the island at the OTHER end.
   */
  _peekEnds() {
    const ends = [];
    for (const B of this.sim?.bridges ?? []) {
      const pts = B.road.pts;
      for (const [i, j, k] of [[0, pts.length - 1, 1], [pts.length - 1, 0, pts.length - 2]]) {
        const m = pts[i];
        const n = pts[i === 0 ? 1 : k];
        const tl = Math.hypot(n.x - m.x, n.z - m.z) || 1;
        const o = pts[j];
        const disc = this.sim._discAt({ x: o.x - SIM.dx, y: o.y, z: o.z - SIM.dz });
        const far = disc
          ? { x: disc.x + SIM.dx, y: disc.y, z: disc.z + SIM.dz }
          : { x: o.x, y: o.y, z: o.z };
        ends.push({ road: B.road, mouth: m, toward: { x: (n.x - m.x) / tl, z: (n.z - m.z) / tl }, far });
      }
    }
    return ends;
  }

  /**
   * The look across for one kitten this frame, or null. Only a kitten in
   * the layer, on her own paws, on a floor, and not in a drill — a drill
   * near a rim (the Shadow's floor runs to its edge) must keep its camera.
   * See dream/peek.js for the distances and the heading rule.
   */
  _peekFor(p) {
    const s = this.st[p.index];
    if (s?.phase !== 'sim' || !p.onGround || p.snakeRide || p.onCycle || p.mount || p.rideAlong
      || p.pandaMount || p.pinnedAt) {
      if (s) s.peek = null;
      return null;
    }
    const dr = this.drills[p.index];
    if (dr && (dr.state === 'ready' || dr.state === 'live')) { s.peek = null; return null; }
    this._ends ??= this._peekEnds();
    let best = null;
    let bw = 0;
    for (const E of this._ends) {
      const w = peekWeight(p.position, p.velocity ?? { x: 0, z: 0 }, E);
      /* STANDING STILL KEEPS THE ANSWER: she stopped to look, or she stopped
         walking away. A negative weight is "no opinion" at that strength. */
      const k = w < 0 ? (s.peek?.end === E ? -w : 0) : w;
      if (k > bw) { bw = k; best = E; }
    }
    if (!best) { s.peek = null; return null; }
    s.peek = { end: best };
    return { x: p.position.x, y: p.position.y, z: p.position.z, far: best.far, w: bw };
  }

  /** Lionheart, in light, at his own spot on the port. */
  _buildHoloLion() {
    const art = this.lionArt;
    if (!art) return;
    const L = this.layout;
    const p = toSim(L.lion.x, L.lion.z);
    const quad = LION_HEIGHT / (art.contentScale || 1);
    const b = new Billboard(art.texture, {
      cols: 1, rows: 1, width: quad, height: quad, footOffset: (art.pad ?? 0) * quad, mirror: false,
    });
    b.mat.color.set(0x9ff6ff);
    b.mat.transparent = true;
    b.mat.opacity = 0.85;
    this.holoLion = new THREE.Group();
    this.holoLion.position.set(p.x, ARCADE.y, p.z);
    this.holoLion.add(b);
    this.holoLionSprite = b;
    /* HIS OWN BUBBLES. The real Lionheart's hang off the real Lionheart, in a
       reality nobody in here can see — so everything he says in the sim is
       said by the hologram. Stage one said its welcome to the wrong one. */
    this.holoBubbles = new Map();
    this.holoShow = 0;
    this.game.scene.add(this.holoLion);
    this.sim.solids.push({ x: L.lion.x, z: L.lion.z, r: 1.25 });
  }

  /**
   * THE TUBES, IN HERE TOO. Richard: "We have VR tubes in the main world but
   * not in the Dream Dojo simulation, let's have it there as well with the
   * players color, so the player knows which tube to step into to leave the
   * simulation." The way out was a cyan ring on the floor, the same for all
   * four, and a DISCONNECT prompt that only appeared once she was already
   * standing in the right one.
   *
   * The same glass as the real ones (TUBE_VERT/FRAG), on the same four spots
   * (the port rings, which `onPort` already measures), each in ITS kitten's
   * colour with her number over it — but light all the way down: rings of
   * light for the base and cap, nothing solid, because nothing in here is.
   * A seat whose kitten is not in the sim is a dim grey ghost of a tube; hers
   * glows in her colour, and brightest while she stands in it.
   */
  _buildSimTubes() {
    const L = this.layout;
    const g = this.game;
    this.simTubes = L.tubes.map((t, i) => {
      const col = g.players?.[i]?.style?.colour ?? TUBE_COLOURS[i];
      const u = { uTime: { value: 0 }, uGlow: { value: 0.2 }, uColor: { value: new THREE.Color(col) } };
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(TUBE_R, TUBE_R, 5.0, 32, 1, true),
        new THREE.ShaderMaterial({
          vertexShader: TUBE_VERT, fragmentShader: TUBE_FRAG, uniforms: u,
          transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
        })
      );
      glass.position.set(t.x, ARCADE.y + 2.8, t.z);
      glass.renderOrder = 5;
      const ringMat = new THREE.MeshBasicMaterial({
        color: col, transparent: true, opacity: 0.85, toneMapped: false, depthWrite: false, blending: THREE.AdditiveBlending,
      });
      const rings = [0.14, 5.35].map((y) => {
        const r = new THREE.Mesh(new THREE.TorusGeometry(TUBE_R + 0.3, 0.09, 6, 48), ringMat);
        r.rotation.x = Math.PI / 2;
        r.position.set(t.x, ARCADE.y + y, t.z);
        return r;
      });
      const num = new THREE.Mesh(
        new THREE.PlaneGeometry(1.3, 1.3),
        new THREE.MeshBasicMaterial({ map: numberTexture(i + 1, css(col)), transparent: true, depthWrite: false, toneMapped: false })
      );
      num.position.set(t.x, ARCADE.y + 6.5, t.z);
      num.renderOrder = 7;
      this.sim.root.add(glass, ...rings, num);
      return { u, glass, rings, ringMat, num, col: new THREE.Color(col) };
    });
  }

  /** Hers lit in her colour while she is in here, brightest when she stands in it. */
  _updateSimTubes() {
    if (!this.simTubes) return;
    const grey = _grey.set(0x5a6070);
    this.simTubes.forEach((T, i) => {
      const p = this.game.players?.[i];
      if (p?.style?.colour != null) T.col.set(p.style.colour);
      const here = !!p && this.realmOf(p) === 'sim';
      const glow = here ? (this.onPort(p) ? 1 : 0.55) : 0.08;
      T.u.uTime.value = this.t;
      T.u.uGlow.value += (glow - T.u.uGlow.value) * 0.08;
      T.u.uColor.value.copy(here ? T.col : grey);
      T.ringMat.color.copy(here ? T.col : grey);
      T.ringMat.opacity = here ? 0.85 : 0.25;
      T.num.material.opacity = here ? 1 : 0.3;
      const ring = this.sim.portRings?.[i];
      if (ring) ring.material.color.copy(here ? T.col : grey);
    });
  }

  /** Move her (and her camera) across the boundary, by exactly the offset. */
  _cross(p, toSimNow, keepSuit = false) {
    if (!toSimNow) this._leaveSim(p, keepSuit);
    // The look across is in the layer's coordinates: never carried over.
    p.peekAt = null;
    if (p.bridgePeek) p.bridgePeek.w = 0;
    const k = toSimNow ? 1 : -1;
    const dx = SIM.dx * k;
    const dz = SIM.dz * k;
    p.position.x += dx; p.position.z += dz;
    p.camTarget.x += dx; p.camTarget.z += dz;
    p.camera.position.x += dx; p.camera.position.z += dz;
    if (p.pinnedAt) { p.pinnedAt.x += dx; p.pinnedAt.z += dz; }
    p.group.position.copy(p.position);
    p.realm = toSimNow ? 'sim' : null;
    /* AND HER DRAWING CROSSES WITH HER: in the headset for as long as she is
       in here. Since the suit-up she put it on at Lionheart's, so this only
       matters for a kitten sent in some other way. `_leaveSim` takes it off
       on every way out EXCEPT the ordinary one, where she walks out of her
       tube and poofs back into her clothes (`walkout`, `unsuit`). The tube
       puppet wears her gear too — it is her body, suited, in the tube. */
    if (toSimNow) p.setSimLook?.(true);
    /* AND A SAVE TAKEN NOW SAYS SHE IS IN HER TUBE. `castRow` reads this
       before `position`, so nobody ever loads a game standing in the void. */
    const s = this.st[p.index];
    p.dreamAnchor = toSimNow ? s.anchor.clone() : null;
    s.proxy = null;
    if (toSimNow) {
      this.refillSim(p);
      /* THE INVITATION, ONCE A VISIT. A kitten wearing orbs is told there is
         a rundown; she is never put through one she did not ask for. */
      if (p.powerOrbs?.length) {
        this.holoSay(LION_LINES.rundown.replace('%n', p.name).replace('%k', String(p.powerOrbs.length)), 8);
      }
    }
  }

  _onFall(p) {
    const s = this.st[p.index];
    if (!s) return;
    // A short re-rez on her ring, so falling off reads as the sim catching her.
    s.rezT = 0;
    this.game.sfx?.('rez');
    this.game.toast?.(`${p.name} fell out of the simulation — back to your ring!`, p.index);
  }

  /** Pull everybody out at once — a scene, the tournament, the ending. */
  exitAll() {
    for (const p of this.game.players ?? []) {
      if (!p) continue;
      const s = this.st[p.index];
      /* OUT OF THE GEAR TOO, and off the racks: a scene or the tournament
         takes her out of the Dream Dojo entirely, and nothing she was halfway
         through survives it. A half-gathered set is gathered again from the
         start, which costs three short walks and can never lose anything. */
      if (p.simLook && this.realmOf(p) !== 'sim') p.setSimLook?.(false);
      if (s) s.gather = null;
      if (!s?.phase) continue;
      if (this.realmOf(p) === 'sim') {
        const tube = this.layout.tubes[p.index];
        p.position.set(tube.x + SIM.dx, ARCADE.y, tube.z + SIM.dz);
        this._cross(p, false);
        p.camTarget.copy(p.position);
      }
      p.pinnedAt = null;
      this._hidePuppet(p);
      this._rezOff(p);
      s.phase = null;
      s.fx = 0;
    }
  }

  /** A new afternoon: everybody out, and nothing remembered. */
  reset() {
    this.exitAll();
    this.shadow?.dispose();
    for (let i = 0; i < this.st.length; i++) this.drop(i);
    this.st = [];
    this._welcomed = false;
    this.sayText = null;
    this.approach?.reset();
    this.lecture?.reset();
    this._cam = [];
  }

  /** Forget a kitten who has left the game. */
  drop(i) {
    const s = this.st[i];
    if (!s) return;
    const p = this.game.players?.[i];
    if (p && this.realmOf(p) === 'sim') this._leaveSim(p);
    else if (p?.simLook) p.setSimLook?.(false);
    s.puppet?.removeFromParent();
    this.st[i] = null;
  }

  update(dt) {
    if (!this.built) return;
    const g = this.game;
    this.t += dt;
    const ease = (x) => x * x * (3 - 2 * x);

    for (const p of g.players ?? []) if (p) p.peekAt = this._peekFor(p);

    /* FIRST: is anything taking the whole screen? Then nobody stays inside —
       a scene that frames "the kittens" must find them in the real world,
       and the tournament must find every fighter on its own island. */
    const pull = g._sceneActive?.() || g.tournament?.active || g.travel || g._finaleDue;
    if (pull && this.busy) this.exitAll();

    for (const p of g.players ?? []) {
      if (!p) continue;
      const s = this.st[p.index];
      if (!s?.phase) continue;
      s.t += dt;
      const tube = this.layout.tubes[p.index];
      s.anchor ??= new THREE.Vector3();
      s.anchor.set(tube.x, ARCADE.y + FLOAT_H, tube.z);
      switch (s.phase) {
        case 'walk': {
          /* THE WALK IS HER OWN LEGS on a pad that points at her tube. A
             kitten driven to a spot by setting her position would slide; this
             way she walks, turns and climbs the step like she always does. */
          const dx = tube.x - p.position.x;
          const dz = tube.z - p.position.z;
          const d = Math.hypot(dx, dz);
          const own = g.input?.players?.[p.index];
          if (own && Math.hypot(own.mx ?? 0, own.my ?? 0) > 0.6 && s.t > 0.4) {
            // She took the stick back. Fine — the tube will wait.
            s.phase = null;
            s.walkPad = null;
            break;
          }
          if (d < 0.35 || s.t > SEQ.walkMax) {
            if (s.t > SEQ.walkMax) p.position.set(tube.x, ARCADE.y, tube.z);
            s.walkPad = null;
            this._begin(p, 'rise');
            break;
          }
          const { fwd, right } = p._basis();
          const wx = dx / d;
          const wz = dz / d;
          const slow = Math.min(1, d / 1.2);
          s.walkPad = {
            mx: (wx * right.x + wz * right.z) * slow,
            my: -(wx * fwd.x + wz * fwd.z) * slow,
            down: () => false, pressed: () => false,
          };
          break;
        }
        case 'rise': {
          const k = ease(Math.min(1, s.t / SEQ.rise));
          // Drawn into the middle of the tube as she rises.
          p.pinnedAt.set(
            THREE.MathUtils.lerp(s.from.x, tube.x, Math.min(1, s.t / 0.5)),
            ARCADE.y + FLOAT_H * k,
            THREE.MathUtils.lerp(s.from.z, tube.z, Math.min(1, s.t / 0.5))
          );
          p.facing = THREE.MathUtils.lerp(p.facing, Math.atan2(-this.layout.u.x, -this.layout.u.z), Math.min(1, dt * 4));
          s.fx = 0.3 * k;
          if (s.t >= SEQ.rise) {
            s.phase = 'link';
            s.t = 0;
            g.sfx?.('connect');
          }
          break;
        }
        case 'link': {
          s.fx = 0.3 + 0.7 * ease(Math.min(1, s.t / SEQ.link));
          if (s.t >= SEQ.link) {
            /* THE CROSSING, at the top of the rain. Her puppet takes her place
               in the tube on this same frame, so the real world never shows an
               empty tube with a kitten-shaped gap in the story. */
            this._showPuppet(p);
            this._cross(p, true);
            s.phase = 'rez';
            s.t = 0;
            s.rezT = 0;
            g.sfx?.('rez');
            if (!this._welcomed) {
              this._welcomed = true;
              this.holoSay(LION_LINES.sim, 7);
            }
          }
          break;
        }
        case 'rez': {
          s.fx = 1 - ease(Math.min(1, s.t / 0.8));
          // Float down onto the ring as she resolves.
          const port = toSim(tube.x, tube.z);
          p.pinnedAt.set(port.x, ARCADE.y + FLOAT_H * (1 - ease(Math.min(1, s.t / SEQ.rez))), port.z);
          if (s.t >= SEQ.rez) {
            p.pinnedAt = null;
            s.phase = 'sim';
            s.t = 0;
            s.fx = 0;
          }
          break;
        }
        case 'sim':
          s.fx = 0;
          break;
        case 'derez': {
          const k = ease(Math.min(1, s.t / 0.5));
          p.pinnedAt.lerpVectors(s.from, s.to, k);
          s.rezT = 1 - Math.min(1, s.t / SEQ.derez);
          s.fx = ease(Math.min(1, s.t / SEQ.derez));
          if (s.t >= SEQ.derez) {
            p.position.copy(s.to);
            this._cross(p, false, true);
            p.pinnedAt = p.position.clone();
            this._hidePuppet(p);
            s.phase = 'descend';
            s.t = 0;
            s.rezT = null;
          }
          break;
        }
        case 'descend': {
          const k = ease(Math.min(1, s.t / SEQ.descend));
          p.pinnedAt.set(tube.x, ARCADE.y + FLOAT_H * (1 - k), tube.z);
          s.fx = 1 - ease(Math.min(1, s.t / 0.7));
          if (s.t >= SEQ.descend) {
            p.pinnedAt = null;
            g.sfx?.('visor');
            s.fx = 0;
            this._begin(p, 'walkout');
          }
          break;
        }
        case 'suit':
        case 'unsuit': {
          /* TURN TO THE LENS — "have them turn to camera, and then have a
             special effect play, covering up their body while they magically
             appear with all the sprite/VR outfit on". Her own pane's camera,
             so in a split screen each kitten turns to the one watching her. */
          const cam = p.camera?.position;
          if (cam) p.facing = Math.atan2(cam.x - p.position.x, cam.z - p.position.z);
          if (p.sprite && p.anim) p.sprite.row = p.anim.idle;
          if (!s.poofed && s.t >= 0.05) {
            s.poofed = true;
            this.poof(p, s.phase === 'suit' ? 'full' : 'small');
            g.sfx?.('pandapoof');
          }
          // Changed while the cloud is at its thickest.
          if (!s.dressed && s.t >= 0.32) {
            s.dressed = true;
            p.setSimLook?.(s.phase === 'suit');
            if (s.phase === 'suit') g.sfx?.('visor');
          }
          if (s.t >= (s.phase === 'suit' ? SEQ.suit : SEQ.unsuit)) {
            p.pinnedAt = null;
            if (s.phase === 'suit') {
              this.say(LION_LINES.send.replace('%n', p.name).replace('%t', String(p.index + 1)), 5);
              this._begin(p, 'walk');
            } else {
              s.phase = null;
            }
          }
          break;
        }
        case 'walkout': {
          const dx = s.outTo.x - p.position.x;
          const dz = s.outTo.z - p.position.z;
          const d = Math.hypot(dx, dz);
          if (d < 0.4 || s.t > SEQ.walkOutMax) {
            s.walkPad = null;
            this._begin(p, 'unsuit');
            break;
          }
          const { fwd, right } = p._basis();
          const wx = dx / d;
          const wz = dz / d;
          const slow = Math.min(1, d / 1.2);
          s.walkPad = {
            mx: (wx * right.x + wz * right.z) * slow,
            my: -(wx * fwd.x + wz * fwd.z) * slow,
            down: () => false, pressed: () => false,
          };
          break;
        }
        default: break;
      }
    }

    this._updateGear(dt);
    this._updateSign();
    this._updateTraining(dt);
    this._updateRez(dt);
    this._updatePuppets(dt);
    this._updateTubes(dt);
    this._updateSimTubes();
    this._updateDome(dt);
    this.approach?.update(dt);
    this._dt = dt;
    this.lecture?.update();
    this._updateLion(dt);
    if (this.sim) {
      this.sim.update(dt);
      const inside = (g.players ?? []).filter((p) => p && this.realmOf(p) === 'sim');
      this.simDojo?.update(dt, inside);
      this.simDojoFx?.update(this.t);
      this.sim.steerBridges(dt, inside);
    }
  }

  /* ----------------------------- training -------------------------------- */

  /** The Game as a kitten in here sees it — see dream/simhud.js. */
  hudFor(p) {
    return this.realmOf(p) === 'sim' && this.simHud ? this.simHud : this.game;
  }

  /**
   * `Game.critterHold`, for a kitten in the sim: is this ATTACK press the eat
   * gesture? Only her live drill can say — the Feast is the one that owns
   * animals (`holds` in school.js). Everywhere else the technique is hers.
   */
  critterHold(p) {
    const d = p ? this.drills[p.index] : null;
    return d?.state === 'live' && !!d.spec.holds?.(d);
  }

  /** `Game.strikePlayers`, for a kitten in the sim: holograms only. */
  onStrike(attacker, kind, reach, dir, spent = null) {
    /* ONE CHARGE, ONE BLOW PER HOLOGRAM. Richard: "using the charge ability
       quickly kills him, it should just do 1 hit amount of damage to him and
       not keep recursively hitting him." `_chargeStrike` asks the gate on
       EVERY frame the charge is live; in the ring it is `hurt`'s
       invulnerability that makes that one blow, and a hologram has no such
       window — so a charge through the Shadow landed about a blow a frame,
       a dozen of his 24 in one press. The charge's own spent set
       (`_chargeHit`, new each charge, which already stops a barrel or a rat
       being hit forty times) is handed to the gate HERE, in the sim only, so
       the ring's answer is untouched (non-negotiable 5). */
    if (!spent && kind === 'charge') spent = attacker._chargeHit ?? null;
    const n = this.gate.strike(attacker, kind, reach, dir, spent);
    /* EVERY SWING, EVEN ONE THAT FOUND NOTHING — a kata's CUT is the swing
       on the beat, and the range's ONE SWING counts what one call reached. */
    const d = this.drills[attacker.index];
    if (d?.state === 'live') d.spec.swing?.(d, kind, n, this.gate.swing);
    return n;
  }

  simKittens() {
    return (this.game.players ?? []).filter((p) => p && this.realmOf(p) === 'sim');
  }

  /** Her button for an action, the way her callout prints it. */
  key(p, action) {
    return this.game.input?.promptFor?.(p.index, action) ?? action.toUpperCase();
  }

  /**
   * A kitten's drawing for a holo-kitten to wear — anybody's will do — IN THE
   * HEADSET, when the sim's sheets have landed. A sparring partner in here is
   * somebody else in the simulator, and they were the one thing left wearing
   * the town drawing: "When in the simulation, it is not showing the players
   * generated VR sprites." Sized and sensed exactly as `Player.setSimLook`
   * puts her own on, so the two stand the same height; the home drawing is
   * the rule that degrades.
   */
  kittenSpec() {
    const players = (this.game.players ?? []).filter((p) => p?.spriteSpec?.texture);
    for (const p of players) {
      const a = p._simArt;
      if (!a?.texture) continue;
      const quad = p.height / (a.contentScale || 1);
      return {
        texture: a.texture,
        opts: { ...p.spriteSpec.opts, cols: a.cols, rows: a.rows, width: quad, height: quad, footOffset: (a.pad ?? 0) * quad },
      };
    }
    return players[0]?.spriteSpec ?? null;
  }

  /** A drill telling her how — throttled, so a held button is one toast. */
  hint(p, text) {
    const last = this._hintAt.get(p.index) ?? -99;
    if (this.t - last < 1.8) return;
    this._hintAt.set(p.index, this.t);
    this.game.toast?.(`${p.name} — ${text}`, p.index);
  }

  /** Her station, if she is standing on one.
   *
   *  NONE WHILE HER DRILL IS RUNNING. INTERACT is the drill's button then —
   *  it is the clan power, the dive, the Flash Step — and the Windwhisker
   *  trial's holo-kittens stand a breath away from the shrine she started it
   *  at, so a station that still answered would restart the trial on the
   *  very press it was teaching. Once the drill has ended, she can go again. */
  stationAt(p) {
    if (this.realmOf(p) !== 'sim') return null;
    const dr = this.drills[p.index];
    if (dr && (dr.state === 'ready' || dr.state === 'live')) return null;
    const q = this._flatPos(p);
    for (const st of this.stations) {
      if (Math.hypot(q.x - st.x, q.z - st.z) < st.r && Math.abs(p.position.y - st.y) < 2) return st;
    }
    return null;
  }

  /**
   * LEND HER ORBS, for as long as she is in here.
   *
   * THE LOAN NEVER TOUCHES `powerOrbs`. It is folded into `p.power` (every
   * buff reads that) and into the worn ring (so she can SEE it), and
   * `powerOrbs` — what the save, the trade screen, the dealer and a 盗 steal
   * all read — is exactly what it was. `_leaveSim` puts `power` back from it.
   *
   * IT TOPS UP BY COUNT. `ids` says how many of each kind the drill wants her
   * to have; what she wears counts toward it and only the shortfall is lent.
   * Long Guard asks for a PAIR, and a kitten who owns one Nagamori is lent the
   * second — the first cut skipped any kind she owned at all, so she ran the
   * beam on one and could not pass it.
   */
  lend(p, ids) {
    const s = this.st[p.index];
    if (!s) return;
    s.loans ??= [];
    const fresh = [];
    for (const id of new Set(ids)) {
      const want = ids.filter((x) => x === id).length;
      const own = (p.powerOrbs ?? []).filter((x) => x === id).length;
      let have = own + s.loans.filter((x) => x === id).length;
      while (have < want) { s.loans.push(id); have++; fresh.push(id); }
    }
    this._applyKit(p, true);
    if (fresh.length) {
      const names = [...new Set(fresh)].map((id) => ORB_BY_ID[id]?.name ?? id).join(', ');
      this.game.toast?.(`${p.name} borrowed ${names} — only in the simulator`, p.index);
      this.game.sfx?.('powerorb');
    }
  }

  /** `p.power` and the worn ring, from her real orbs plus her loans. */
  _applyKit(p, force = false) {
    const s = this.st[p.index];
    const ids = [...(p.powerOrbs ?? []), ...(s?.loans ?? [])];
    const sig = ids.join(',');
    if (!force && s?.kitSig === sig) return;
    if (s) s.kitSig = sig;
    p.power = aggregate(ids);
    this._syncMeshes(p, ids);
  }

  /** `Game.syncOrbMeshes`, but for a list that is not `powerOrbs`. */
  _syncMeshes(p, ids) {
    if (!p.orbRoot) return;
    for (const o of p.wornOrbs ?? []) p.orbRoot.remove(o.group);
    p.wornOrbs = buildWornOrbs(ids);
    for (const o of p.wornOrbs) {
      o.setMathVisible?.(this.game.mathVisible);
      p.orbRoot.add(o.group);
    }
  }

  /**
   * SWEAR TO A CLAN, FOR AS LONG AS SHE IS IN HERE.
   *
   * Her real clan is kept on `p.dreamOath.was` — the first time only, so two
   * trial oaths in a row still remember the REAL one — and `castRow` saves
   * that, never this. Nothing the real game hangs off an oath runs: no
   * `onJoinClan`, no cheer, no panda, no quest.
   */
  swearFor(p, clan) {
    p.dreamOath ??= { was: p.clan ?? null };
    if (p.clan?.id !== clan.id) {
      p.clan = clan;
      p.clanRing?.material.color.set(clan.color);
      this.game.toast?.(`${p.name} swore to ${clan.name} — only in the simulator`, p.index);
      this.game.sfx?.('clan');
    }
  }

  /** Everything sim-only comes off her: drill, rundown, loans, oath, bar. */
  _leaveSim(p, keepSuit = false) {
    const s = this.st[p.index];
    this._hushHolo(p);
    if (!keepSuit) p.setSimLook?.(false);
    this.highway?.stop(p);
    const d = this.drills[p.index];
    if (d) { d.dispose(); this.drills[p.index] = null; }
    this._closeRundown(p);
    if (s) { s.loans = []; s.kitSig = null; }
    p.power = aggregate(p.powerOrbs ?? []);
    if (this.game.syncOrbMeshes) this.game.syncOrbMeshes(p);
    else this._syncMeshes(p, p.powerOrbs ?? []);
    if (p.dreamOath) {
      p.clan = p.dreamOath.was;
      p.dreamOath = null;
      p.clanRing?.material.color.set(p.clan?.color ?? p.style?.colour ?? 0xffffff);
    }
    // A mark on a hologram means nothing out there.
    if (p.stealTarget && !this.game.players?.includes(p.stealTarget)) p._endMark?.(null);
    s?.bar?.removeFromParent();
  }

  startDrill(p, spec, at) {
    this._closeRundown(p);
    const old = this.drills[p.index];
    if (old) old.dispose();
    this.drills[p.index] = new Drill(this, p, spec, at);
  }

  /** Write a result down — returns what changed, for the card. */
  award(p, id, stars, score, lowerIsBetter) {
    const r = this.progress.award(p.style?.name ?? p.name, id, stars, score, { lowerIsBetter });
    // The day's and the week's boxes (dream/rank.js) are paid off the same result.
    this.ranks?.onAward(p, id, stars);
    return r;
  }

  _openRundown(p) {
    this._closeRundown(p);
    this.rundowns[p.index] = new Rundown(this, p);
  }

  _closeRundown(p) {
    const r = this.rundowns[p.index];
    if (!r) return;
    r.dispose();
    this.rundowns[p.index] = null;
    this.progress.setFlag(p.style?.name ?? p.name, 'rundown');
  }

  /* --- the SIM bar --- */

  simMax(p) { return p.power?.hp ?? 100; }

  simFrac(p) {
    const s = this.st[p.index];
    return s ? Math.max(0, s.simHp ?? this.simMax(p)) / this.simMax(p) : 1;
  }

  refillSim(p) {
    const s = this.st[p.index];
    if (!s) return;
    s.simHp = this.simMax(p);
    s.iframes = 0;
  }

  /**
   * A hologram hit her. NOT `hurt` — her health is the ring's and this is not
   * the ring. Same order of questions `hurt` asks, though, so the lesson is
   * the real one: a Flash Step is untouchable, a Ward blocks (and a blow
   * costs the Ward exactly what it costs in the arena, through her own
   * `_wardTakeHit`), and a fresh hit is followed by a moment of grace.
   *
   * 返 RIPOSTE IS ASKED HERE TOO, before the Ward, which is where
   * `Game.strikePlayers` asks it. `from` is where the blow came from, in the
   * layer, and only a BLOW has one: a beam (`hold`) or a wall of light is not
   * something a guess about when and where can catch, so lasers pass none.
   * Without this a kitten lent 返 in the Gallery could raise her guard at a
   * bolt and be hit through it, because this function was the whole of the
   * sim's combat and had never heard of the orb — it was merged after the
   * simulator was built (Richard: "make it work with the simulator").
   * The answer swing is `riposte`, through the sim's own hud, so it reaches
   * holograms and only holograms (`TrainingGate.strike`).
   *
   * @returns {'none'|'dodged'|'parried'|'blocked'|'immune'|'hit'}
   */
  simHit(p, { dmg = 10, push = null, src = 'laser', hold = false, from = null, foe = null } = {}) {
    const s = this.st[p.index];
    if (!s || this.realmOf(p) !== 'sim') return 'none';
    if (p.dodgeAt) return 'dodged';
    if (from && !hold) {
      const at = { x: from.x + SIM.dx, z: from.z + SIM.dz };
      if (p.parries?.(at)) {
        p.riposte?.(foe ?? { position: at }, this.simHud);
        return 'parried';
      }
    }
    if (p.warded) {
      // A held beam is blocked by the bubble being UP; it does not break it.
      if (hold) p.wardFlash = 0.25;
      else p._wardTakeHit?.(this.simHud);
      return 'blocked';
    }
    if ((s.iframes ?? 0) > 0) return 'immune';
    s.simHp = (s.simHp ?? this.simMax(p)) - dmg;
    s.iframes = 0.6;
    p.flashT = 0.3;
    /* A NUDGE, NOT A THROW. Six units a second and a hop: enough that walking
       into a wall of light reads as being stopped by it, and far short of
       what would carry a kitten off an island from anywhere on its floor. */
    if (push) {
      p.velocity.x = push.x * 6;
      p.velocity.z = push.z * 6;
      p.velocity.y = Math.max(p.velocity.y, 3);
    }
    this.game.sfx?.('hit');
    if (s.simHp <= 0) this._simCatch(p);
    return 'hit';
  }

  /** Her bar ran out: the simulator catches her, and what she was doing stops. */
  _simCatch(p) {
    const d = this.drills[p.index];
    /* A DRILL MAY CATCH HER ITSELF. A practice round's knockout is not the
       round ending — her side carries on without her (dream/school.js) — so
       `spec.caught` answers first, and only a drill with no answer fails. */
    if (d && (d.state === 'live' || d.state === 'ready') && !d.spec.caught?.(d)) d.fail('SIM bar empty — the simulator caught you');
    // Shadow Lionheart sets her back down at the arena's edge (dream/shadow.js).
    this.shadow?.onCatch(p);
    this.refillSim(p);
    const s = this.st[p.index];
    s.rezT = 0;
    this.game.sfx?.('rez');
  }

  _updateTraining(dt) {
    this.shards?.update(dt);
    for (const p of this.game.players ?? []) {
      if (!p) continue;
      const s = this.st[p.index];
      const inside = this.realmOf(p) === 'sim';
      if (!s || !inside) continue;
      s.iframes = Math.max(0, (s.iframes ?? 0) - dt);
      // Her real orbs can change in here (the profile's INVENTORY tab).
      this._applyKit(p);
      const d = this.drills[p.index];
      if (d && !d.update(dt)) { d.dispose(); this.drills[p.index] = null; }
      const r = this.rundowns[p.index];
      if (r && !this.canTalk(p)) this._closeRundown(p);
      // The bar shows when it is not full, or while a drill could take it.
      const max = this.simMax(p);
      s.simHp = Math.min(s.simHp ?? max, max);
      const show = s.simHp < max - 0.5 || !!this.drills[p.index]?.lasers.length || !!this.drills[p.index]?.bolts.length;
      if (show && !s.bar) {
        s.bar = new SimBar({ w: 2.4, h: 0.24 });
        s.bar.position.y = (p.height ?? 2.6) + 1.2;
      }
      if (s.bar) {
        if (show && !s.bar.parent) p.group.add(s.bar);
        if (!show && s.bar.parent) s.bar.removeFromParent();
        s.bar.setFrac(s.simHp / max, dt);
      }
      // A slow refill when nothing is trying to hit her.
      if (!this.drills[p.index] && s.simHp < max) s.simHp = Math.min(max, s.simHp + dt * 12);
    }
  }

  /* --------------------------- the look of her ---------------------------- */

  /** The headset on her own head, for the rise and the descent. */
  /**
   * THE SIGN FLOATS. "If it is floating, have it bouncing around and fading
   * in/out a bit to look more holographic." A slow bob (0.35 units, 0.9 rad/s
   * — slow enough to read the words on the way past), a sway of a few degrees
   * that `faceCamera` adds on top of its turn to the lens, and a flicker that
   * now and then drops it most of the way out for a few frames, the way a bad
   * projector does. Seeded off the clock, so two panes flicker together.
   */
  _updateSign() {
    if (!this.sign || !this.signU) return;
    const t = this.t;
    this.sign.position.y = ARCADE.y + SIGN_Y + Math.sin(t * 0.9) * 0.35 + Math.sin(t * 2.3) * 0.06;
    this._signSway = Math.sin(t * 0.55) * 0.07;
    this._signTilt = Math.sin(t * 0.7 + 1.3) * 0.025;
    this.signU.uTime.value = t;
    const blink = Math.sin(Math.floor(t * 7) * 91.7) > 0.965 ? 0.35 : 1;
    this.signU.uAlpha.value = (0.78 + 0.14 * Math.sin(t * 1.7)) * blink;
    if (this.signCone) this.signCone.material.opacity = 0.05 + 0.03 * Math.sin(t * 1.7) * blink;
  }

  /**
   * The Dream Dojo's music for this frame: 1 inside the dome or the simulator,
   * `MUSIC_SWELL.near` at the dome's skin, falling to `floor` at the far edge
   * of the crossing, and 0 beyond it. The loudest kitten wins: the music is
   * one speaker for the whole screen, and the sister at the door is the one it
   * is for. A kitten on a dragon does not count — the flight theme has her.
   */
  musicLevel(players = this.game.players ?? []) {
    const L = this.layout;
    if (!L) return 0;
    const far = Math.hypot(L.launch.x - ARCADE.x, L.launch.z - ARCADE.z) + MUSIC_SWELL.beyond;
    const edge = far + (this._vrMusic ? MUSIC_SWELL.out : 0);
    let best = 0;
    for (const p of players) {
      if (!p || p.mount || p.rideAlong) continue;
      if (this.realmOf(p) === 'sim') { best = 1; break; }
      const d = Math.hypot(p.position.x - ARCADE.x, p.position.z - ARCADE.z);
      let k = 0;
      if (d < DOME_R) k = 1;
      else if (d < edge) {
        const x = THREE.MathUtils.clamp(1 - (d - DOME_R) / (far - DOME_R), 0, 1);
        k = MUSIC_SWELL.floor + (MUSIC_SWELL.near - MUSIC_SWELL.floor) * x * x;
      }
      best = Math.max(best, k);
    }
    this._vrMusic = best > 0;
    return best;
  }

  /** The pad's centre, for the scenes. */
  get arcadePos() { return ARCADE; }

  /**
   * The places a scene reads (`shotFor` in dream/storyscene.js). `cast` is the
   * kittens' marks for a talk. Every field degrades — `shotFor` has a fallback
   * for each — so a scene started before the sim was raised aims somewhere real.
   */
  storyCtx(cast = []) {
    const L = this.layout;
    const dc = this.game.world?.dojoCentre ?? { x: ARCADE.x + 60, y: 30, z: ARCADE.z };
    return {
      arcade: ARCADE,
      lion: this.lion ? { x: this.lion.position.x, y: ARCADE.y, z: this.lion.position.z } : null,
      sign: this.sign ? { x: this.sign.position.x, y: ARCADE.y + SIGN_Y, z: this.sign.position.z } : null,
      stones: L?.stones ?? [],
      tubes: L?.tubes ?? [],
      gear: Object.values(this.gear?.layout?.racks ?? {}),
      u: L?.u ?? { x: 1, z: 0 },
      v: L?.v ?? { x: 0, z: 1 },
      dojo: { x: dc.x, y: dc.y, z: dc.z },
      isles: this.isles ?? {},
      // The Shadow's ring, where the tour's Shadow Lionheart performs.
      shadowStage: this.shadow?.centre ?? null,
      cast,
    };
  }

  /**
   * Payne's VIEW THE DREAM DOJO. Returns null when it started, or the reason
   * it did not, IN WORDS, for her to say (non-negotiable 6). Refused while
   * anybody is in a tube: a scene takes everybody out (`update` calls
   * `exitAll`), and a tour that throws a sister out of a drill is not worth it.
   */
  startTour() {
    const g = this.game;
    if (!this.built || !g.storyScene) return 'not ready';
    if (this.busy) return 'busy';
    if (g.storyScene.active || g._sceneActive?.()) return 'scene';
    // The simulator's islands are in three of the shots...
    this._ensureSim();
    /* ...and Shadow Lionheart is in one of them, in his own sheet, which is
       otherwise only fetched at the first tube. Forty-odd seconds of tour
       come before his line; if it has not landed by then he is drawn from
       Lionheart's tinted town drawing, which is how his fight degrades too. */
    /* ...and the islands are PLAYED in two of them (dream/tourcast.js),
       by a cast built hidden once the headset drawings have landed, so the
       warm-up puts it on the GPU in the drawings it will be seen in. Built
       sooner, in the town drawings, it sent three kitten sheets up that the
       tour then never drew — ~100ms each in the pane. If the drawings are
       still out when its line starts, `start` builds it in the town ones,
       and `dress` changes them when they land. */
    const cast = (this.tourCast ??= new TourCast(this));
    const ready = () => {
      if (!cast.build()) return;
      cast.dress();
      // Only into a warm-up that is running: the queue is shared with the
      // ending's, which draws in the real world's state.
      if (!g._simPrimed) return;
      // Its sheets first, then whatever of its own the sweep finds.
      g.primeTextures?.(cast.textures(), true);
      g.primeMore?.(cast.roots);
    };
    const art = g.loadSimArt?.();
    if (art?.then) art.then(ready, ready); else ready();
    const ctx = this.storyCtx();
    ctx.actors = { simShadow: (this.tourShadow ??= new TourShadow(this)), simHub: cast, simIsles: cast };
    const ok = g.storyScene.start('tour', TOUR, ctx);
    /* THE SIMULATOR GOES UP WHILE PAYNE IS STILL TALKING — the tour's first
       cut into it was a 1.3 second frame. See `Game.primeSim`. */
    if (ok) g.primeSim?.();
    return ok ? null : 'scene';
  }

  /**
   * The crossing's camera for her pane, or null (see JUMP_CAM / DOME_CAM).
   * ONE focus, blended, rather than two handed over: `_updateCamera` takes a
   * focus's pitch the frame it changes, so swapping one focus for another at
   * the door would snap the tilt. Both weights ease, and the result is mixed
   * with the walking camera by them.
   */
  cameraFocus(p) {
    const L = this.layout;
    if (!L || !p) return null;
    const c = (this._cam ??= [])[p.index] ??= { j: 0, d: 0, y: p.position.y, centre: new THREE.Vector3() };
    const dt = Math.min(0.1, this._dt ?? 1 / 60);
    const pos = p.position;
    let wantJ = 0;
    let wantD = 0;
    /* NOT IN THE SIMULATOR, AND NOT EASED OUT OF IT EITHER. Richard: "when
       player is entering the simulation, the camera is in the wrong
       placement. This used to work, so the last batch of fixes seems to have
       broken it." The dome's weight eased to 0 at CAM_BLEND after she
       crossed — and its centre is the REAL pad, 12,000 units from where she
       now stands — so for a couple of seconds her lens was dragged most of
       the way back across the void toward the island she had just left. On
       the far side the weights are dropped on the spot, and her own follow
       camera (which `_cross` carried over with her) is the camera. */
    if (this.realmOf(p) === 'sim') {
      c.j = 0;
      c.d = 0;
      c.y = pos.y;
      return null;
    }
    /* AND IN THE TUBE, HER OWN CAMERA: the float up, the rain filling her
       pane and the float down are framed on HER, which is what the crossing
       was built to (and what it did before the dome had a camera). The dome's
       weight eases out over the walk to the tube and the rise, so by the
       crossing it is all but gone, and the line above drops the rest. */
    const tube = TUBE_PHASES.has(this.st[p.index]?.phase);
    const free = !p.mount && !p.rideAlong && !tube;
    if (free) {
      const h = Math.hypot(pos.x - ARCADE.x, pos.z - ARCADE.z);
      if (h < DOME_R && pos.y > ARCADE.y - 3) wantD = 1;
      else {
        const dl = Math.hypot(pos.x - L.launch.x, pos.z - L.launch.z);
        const onStones = L.stones.some((s) => Math.hypot(pos.x - s.x, pos.z - s.z) < s.r + 5);
        const falling = !p.onGround && this.approach?.fallZone(p);
        wantJ = onStones || falling ? 1
          : THREE.MathUtils.clamp((JUMP_CAM.far - dl) / (JUMP_CAM.far - JUMP_CAM.near), 0, 1);
      }
    }
    const k = Math.min(1, dt * CAM_BLEND);
    c.j += (wantJ - c.j) * k;
    c.d += (wantD - c.d) * k;
    if (c.j + c.d < 0.005) { c.y = pos.y; return null; }
    // Her height moves on landing only — the lens does not bob with the jump.
    if (p.onGround) c.y = pos.y;
    /* The fixed bearing: from the launch toward the middle stone and the last
       one — with three stones, the middle of the way across, and the gate
       straight on past it. */
    const s1 = L.stones[1] ?? L.stones[0];
    const s2 = L.stones.at(-1) ?? s1;
    const lx = (s1.x + s2.x) / 2 - L.launch.x;
    const lz = (s1.z + s2.z) / 2 - L.launch.z;
    const yawJ = Math.atan2(-lx, -lz);
    const w = 1 - c.j - c.d;
    const walkY = pos.y + 1.4;
    c.centre.set(
      pos.x * (w + c.j) + ARCADE.x * c.d,
      walkY * w + (c.y + JUMP_CAM.lift) * c.j + (ARCADE.y + DOME_CAM.lift) * c.d,
      pos.z * (w + c.j) + ARCADE.z * c.d
    );
    // Yaw by the shorter way round from the walking bearing.
    let dy = yawJ - WALK_CAM.yaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    return {
      centre: c.centre,
      aim: true,
      dist: WALK_CAM.dist * w + JUMP_CAM.dist * c.j + DOME_CAM.dist * c.d,
      pitch: WALK_CAM.pitch * w + JUMP_CAM.pitch * c.j + DOME_CAM.pitch * c.d,
      yaw: WALK_CAM.yaw + dy * c.j,
    };
  }

  /** The suit-up's cloud, on her (dream/gear.js). */
  poof(p, size = 'full') {
    this.gear?.poof(p.position, p.style?.colour ?? HOLO.cyan, size, (p.height ?? 3) * 1.05);
  }

  /**
   * The racks, the gathering, and the suit coming off.
   *
   * A KITTEN IN HER GEAR WHO WANDERS OFF THE PAD poofs back into her clothes:
   * the gear lives here, and a kitten in a headset in the arena or at the
   * dealer's would be a drawing the rest of the game has no reason for. The
   * tournament and the scenes take everybody out through `exitAll` anyway;
   * this is the kitten who simply walks away.
   */
  _updateGear(dt) {
    const g = this.game;
    this.gear?.update(dt);
    const need = new Set();
    for (const p of g.players ?? []) {
      if (!p || this.realmOf(p) === 'sim') continue;
      const s = this.st[p.index];
      const h = Math.hypot(p.position.x - ARCADE.x, p.position.z - ARCADE.z);
      if (s?.gather && !s.phase) {
        for (const id of s.gather) need.add(id);
        const id = this.gear?.rackAt(p);
        if (id && s.gather.has(id)) {
          s.gather.delete(id);
          const item = GEAR_ITEMS.find((x) => x.id === id);
          const got = GEAR_ITEMS.length - s.gather.size;
          g.sfx?.('orb');
          g.toast?.(`${p.name} — ${item.name} ✓ (${got} of ${GEAR_ITEMS.length})`, p.index);
          if (!s.gather.size) {
            s.gather = null;
            p.dreamGeared = true;
            this.say(GEAR_LINES.suit, 4);
            this._begin(p, 'suit');
          }
        }
      }
      if (p.simLook && !s?.phase && (h > ARCADE.r + 2 || g.tournament?.active)) {
        this.poof(p, 'small');
        p.setSimLook?.(false);
      }
    }
    this.gear?.light(need);
  }

  /** The kitten in the tube while she is in there: her own sheet, her own
   *  pose, a frame behind her. */
  _showPuppet(p) {
    const s = this.st[p.index];
    if (!s.puppet) {
      const spec = p.spriteSpec;
      if (!spec) return;
      const b = new Billboard(spec.texture, spec.opts);
      b.mat.color.copy(p.sprite.mat.color);
      const grp = new THREE.Group();
      grp.add(b);
      s.puppet = grp;
      s.puppetSprite = b;
      s.puppetHome = b.look;
      s.puppetPoses = {};
    }
    this.game.scene.add(s.puppet);
    s.puppet.visible = true;
  }

  _hidePuppet(p) {
    const s = this.st[p.index];
    if (s?.puppet) s.puppet.visible = false;
  }

  _updatePuppets() {
    for (const p of this.game.players ?? []) {
      const s = p && this.st[p.index];
      if (!s?.puppet?.visible) continue;
      /* SHE MIRRORS WHAT SHE IS DOING IN THERE. Row and facing are the whole
         of a pose in this game (see `Billboard`), so copying the two is the
         real-world body doing her moves, a frame behind, in the tube. */
      const b = s.puppetSprite;
      /* IN HER GEAR, LIKE HER. She suited up at Lionheart's, so the body in
         the tube wears the headset sheet too (and there is no visor plane any
         more — see `_begin`). Its own look off the same atlas: two billboards cannot
         share one texture, since each moves its own cell window. */
      const suited = p.simLook && p._simArt;
      if (suited && s.puppetSimFor !== p._simArt) {
        const a = p._simArt;
        const q = (p.height ?? 3) / (a.contentScale || 1);
        s.puppetSim = b.makeLook(a.texture, { cols: a.cols, rows: a.rows, width: q, height: q, footOffset: (a.pad ?? 0) * q });
        s.puppetSimFor = a;
      }
      b.setLook(suited ? s.puppetSim : s.puppetHome);
      b.row = p.sprite.row;
      b.facing = p.sprite.facing;
      b.mesh.scale.copy(p.sprite.mesh.scale);
      /* AND HER SPECIAL POSES: a Goblin Sweep in the sim is a Goblin Sweep in
         the tube. Each of hers that is showing gets a copy on the puppet, off
         whichever drawing she is wearing for it (`Player.setSimLook`), and her
         turnaround is hidden under it the way hers is. */
      let posing = false;
      for (const key of PUPPET_POSES) {
        const src = p[key];
        let cp = s.puppetPoses[key];
        if (src?.visible) {
          const l = src.look;
          if (!cp || cp.userData.tex !== l.tex) {
            cp?.removeFromParent();
            cp = new Billboard(l.tex, { cols: 1, rows: 1, mirror: false, width: l.width, height: l.height });
            cp.mesh.geometry = l.geo;
            cp.userData.tex = l.tex;
            s.puppet.add(cp);
            s.puppetPoses[key] = cp;
          }
          cp.visible = true;
          cp.mesh.scale.copy(src.mesh.scale);
          posing = true;
        } else if (cp) {
          cp.visible = false;
        }
      }
      b.visible = !posing;
      const a = s.anchor;
      s.puppet.position.set(a.x, a.y + Math.sin(this.t * 1.7 + p.index) * 0.12, a.z);
    }
  }

  /** The rez shader and the glint, laid over her own sprite mesh. */
  _rezOn(p) {
    const s = this.st[p.index];
    if (s.rez) return;
    const mesh = p.sprite.mesh;
    const tex = p.sprite.tex;
    const u = {
      map: { value: tex },
      uvTransform: { value: tex.matrix },
      uTint: { value: p.sprite.mat.color },
      uRez: { value: 0 },
      uTime: { value: 0 },
    };
    const rez = new THREE.Mesh(mesh.geometry, new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERT, fragmentShader: REZ_FRAG, uniforms: u,
      transparent: false, side: THREE.DoubleSide,
    }));
    const glint = new THREE.Mesh(mesh.geometry, new THREE.ShaderMaterial({
      vertexShader: SPRITE_VERT, fragmentShader: GLINT_FRAG, uniforms: u,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    }));
    glint.renderOrder = 3;
    mesh.add(rez);
    mesh.add(glint);
    s.rez = { rez, glint, u };
  }

  _rezOff(p) {
    const s = this.st[p.index];
    if (!s?.rez) return;
    s.rez.rez.removeFromParent();
    s.rez.glint.removeFromParent();
    s.rez = null;
    p.sprite.mat.visible = true;
  }

  _updateRez(dt) {
    for (const p of this.game.players ?? []) {
      const s = p && this.st[p.index];
      if (!s) continue;
      const inside = this.realmOf(p) === 'sim';
      if (!inside) { if (s.rez) this._rezOff(p); continue; }
      this._rezOn(p);
      if (s.rezT != null) s.rezT = s.phase === 'derez' ? s.rezT : Math.min(1, s.rezT + dt / SEQ.rez);
      const r = s.rezT ?? 1;
      s.rez.u.uRez.value = r;
      s.rez.u.uTime.value = this.t;
      /* WHILE SHE IS RESOLVING, the shader IS her: her own material steps
         aside so the half of her not yet drawn is genuinely not there. */
      const resolving = r < 0.999;
      s.rez.rez.visible = resolving;
      p.sprite.mat.visible = !resolving;
      s.rez.glint.visible = !resolving;
      if (!resolving && s.phase === 'sim') s.rezT = null;
    }
  }

  /* -------------------------------- props --------------------------------- */

  _updateTubes() {
    if (!this.tubeU) return;
    this.tubeU.forEach((u, i) => {
      u.uTime.value = this.t;
      const s = this.st[i];
      // Lit while she is IN it; half-lit while she is on her way to it or out of it.
      const busy = !!(s?.phase && !['walk', 'suit', 'unsuit', 'walkout'].includes(s.phase));
      const p = this.game.players?.[i];
      u.uGlow.value += ((busy ? 1 : (p && s?.phase === 'walk' ? 0.5 : 0)) - u.uGlow.value) * 0.08;
      if (p?.style?.colour != null) u.uColor.value.set(busy || s?.phase === 'walk' ? p.style.colour : HOLO.cyan);
    });
  }

  /**
   * THE DOME KEEPS ANIMALS OUT. Every dragon, every panda and Ryuuseki is
   * pushed back outside it, every frame, after they have all moved. A kitten
   * riding one is turned away with them and told what to do instead — "a
   * refusal must say so" — and her panda, if it was following her in, waits
   * at the edge, which is a pet that cannot be lost because it is right there.
   */
  _updateDome(dt) {
    const g = this.game;
    this.domeU.uTime.value = this.t;
    this.gateFx?.update(this.t);
    this._domeHit = Math.max(0, this._domeHit - dt * 1.5);
    const push = (body, rider) => {
      const pos = body?.position;
      if (!pos) return;
      /* A DRAGON LEFT OVER THE DOME is sent to the foot of the stones. Her
         dismount aims it at the ground under her (`landAt` / `flyTo` in
         `Player._updateFlight`), and under a kitten who jumped off over the
         dome that ground is the pad: it sat on the glass trying to land
         through it, for good — the other half of "getting stuck on the
         shell". Where it waits instead is where her panda waits
         (`ownerFor`), the last ground before the jump. */
      if (!rider && body.home && typeof body.flyTo === 'function' && body.state !== 'ridden' && this.layout
        && Math.hypot(body.home.x - ARCADE.x, body.home.z - ARCADE.z) < DOME_R + ANIMAL_PAD + 2) {
        body.flyTo(this.layout.launch.x, this.layout.launch.z);
      }
      const hit = animalContact(pos);
      if (!hit) return;
      const sx = hit.x - pos.x;
      const sy = hit.y - pos.y;
      const sz = hit.z - pos.z;
      pos.set(hit.x, hit.y, hit.z);
      body.group?.position.copy?.(pos);
      /* THE KITTENS ON IT MOVE WITH IT. A dragon and Ryuuseki are hung off
         their pilot every frame (`Player._updateFlight`), so pushing only the
         animal put it straight back under her next frame and she flew on
         into the dome — Richard: "the dragon is not flying through, it is
         getting blocked, but the player is able to fly through still". Same
         shift for every kitten whose seat is on this body, and only the part
         of her speed that points INTO the glass is taken away: what is left
         is the slide round it. */
      const n = hit.n;
      for (const q of g.players ?? []) {
        if (!q || (q.mount !== body && q.rideAlong !== body)) continue;
        q.position.x += sx;
        q.position.y += sy;
        q.position.z += sz;
        const v = q.velocity;
        if (!v) continue;
        const vn = v.x * n.x + v.y * n.y + v.z * n.z;
        if (vn < 0) { v.x -= n.x * vn; v.y -= n.y * vn; v.z -= n.z * vn; }
      }
      this._domeHit = 1;
      /* A TOAST AND NOTHING ELSE. No yell, and no mark against her for the
         HONOR talk: Richard, "If player on dragon or panda mount run into the
         shell of the dojo, it should not trigger the apology from Lionheart
         when player enters, that should only get triggered if Lionheart
         executes his 'lion_yell_drop' voice." Brushing the glass on a dragon
         is what flying next to the dome IS now; the drop is a kitten on
         foot landing on top of it (dream/approach.js). */
      if (rider) {
        const last = this._toastAt.get(rider) ?? -99;
        if (this.t - last > 4) {
          this._toastAt.set(rider, this.t);
          g.sfx?.('deny');
          g.toast?.(`${rider.name} — Lionheart's dome keeps animals out. Land on the Dojo and jump across the stones!`, rider.index);
        }
      }
    };
    for (const d of g.dragons ?? []) push(d, d.rider ?? null);
    if (g.ryu) push(g.ryu, (g.players ?? []).find((p) => p && (p.mount === g.ryu || p.rideAlong === g.ryu)) ?? null);
    for (const p of g.players ?? []) {
      if (!p?.panda) continue;
      push(p.panda, p.pandaMount ? p : null);
      // ...and a kitten riding it is carried with it.
      if (p.pandaMount) { p.position.x = p.panda.position.x; p.position.z = p.panda.position.z; }
    }
    this.domeU.uHit.value = this._domeHit;
  }

  _updateLion(dt) {
    if (!this.lion) return;
    const g = this.game;
    const s = this.lionSprite;
    if (s) {
      s.mesh.scale.set(1 - Math.sin(this.t * 1.6) * 0.012, 1 + Math.sin(this.t * 1.6) * 0.016, 1);
    }
    if (this.holoLionSprite) {
      // Soft, not a blink — see `holoFlicker` (it was 5.9 hard blinks a second).
      const flick = holoFlicker(this.t, 1, 0.85, 0.25);
      this.holoLionSprite.mat.opacity = flick;
      this.holoLionSprite.mesh.scale.copy(s?.mesh.scale ?? this.holoLionSprite.mesh.scale);
    }
    /* WHAT HE SAYS: whatever he was last asked, for a while; otherwise his
       invitation to anybody close enough to read it — and the HONOR teaser
       once a kitten has been in, because it means something only then. */
    let near = false;
    for (const p of g.players ?? []) {
      if (!p || this.realmOf(p) === 'sim') continue;
      if (Math.hypot(p.position.x - this.lion.position.x, p.position.z - this.lion.position.z) < 26) near = true;
    }
    let text = null;
    /* QUIET WHILE A SCENE IS TALKING. In a story scene he is speaking from
       the card, and a bubble over his head saying something else would be two
       of him at once — the same rule as #announce's one card. */
    const scene = g.storyScene?.active;
    if (scene) this.sayText = null;
    if (scene) near = false;
    else if (this.sayText && (this.t < this.sayUntil || this.voice.saying(this.sayText))) text = this.sayText;
    else if (near) {
      text = this._welcomed && Math.floor(this.t / 9) % 2 ? LION_LINES.honor : LION_LINES.idle;
      this._ambient(text, false);
    }
    const want = text ? this._bubble(text) : null;
    this.bubbleShow += ((want ? 1 : 0) - this.bubbleShow) * Math.min(1, dt * 5);
    for (const [, m] of this.bubbles) {
      const on = m === want || (m === this._lastBubble && !want);
      m.on = on && this.bubbleShow > 0.02;
      for (const b of [m.r, m.l]) {
        b.material.opacity = this.bubbleShow;
        b.position.y = LION_HEIGHT * 0.9 - (b.userData.tipY ?? 0) + Math.sin(this.t * 1.5) * 0.15;
        if (!m.on) b.visible = false;
      }
    }
    if (want) this._lastBubble = want;

    /* THE HOLOGRAM'S OWN LINES: whatever it was last asked to say, else the
       pitch to anybody standing near it in here. */
    if (this.holoLion) {
      let nearSim = false;
      for (const p of this.simKittens()) {
        const q = this._flatPos(p);
        if (Math.hypot(q.x - this.layout.lion.x, q.z - this.layout.lion.z) < LION_NEAR) nearSim = true;
      }
      let ht = null;
      if (this.holoText && (this.t < this.holoUntil || this.voice.saying(this.holoText))) ht = this.holoText;
      // Quiet while he is giving a rundown: the card IS him talking, and a
      // bubble beside it lands on top of it in a quarter pane.
      else if (nearSim && !this.rundowns.some(Boolean)) {
        ht = Math.floor(this.t / 9) % 2 ? LION_LINES.simIdle : LION_LINES.islands;
        this._ambient(ht, true);
      }
      const hw = ht ? this._bubble(ht, true) : null;
      this.holoShow += ((hw ? 1 : 0) - this.holoShow) * Math.min(1, dt * 5);
      for (const [, m] of this.holoBubbles) {
        const on = m === hw || (m === this._lastHolo && !hw);
        m.on = on && this.holoShow > 0.02;
        for (const b of [m.r, m.l]) {
          b.material.opacity = this.holoShow * 0.92;
          b.position.y = LION_HEIGHT * 0.9 - (b.userData.tipY ?? 0) + Math.sin(this.t * 1.5) * 0.15;
          if (!m.on) b.visible = false;
        }
      }
      if (hw) this._lastHolo = hw;
      this._captionHolo();
    }
  }

  /**
   * HIS WORDS ON THE SCREEN, FOR WHOEVER CANNOT SEE HIM. Richard: "While
   * Lionheart is talking in the simulation, if player is not near him and
   * can't see his text bubble, then we should display his text on the screen,
   * like we do for Payne. Since his text is long, we can display it as it is
   * being said and maybe have it on the bottom of the screen for all the
   * players, like it is for Mr. Satan's voice text in the arena."
   *
   * His voice is one speaker for the whole machine, so a kitten on the Kata
   * floor hears him pitching the islands to her sister at the port, and had
   * nothing to read. Now, while the hologram is SAYING a line aloud and any
   * kitten in the sim is further than LION_NEAR from him, the line goes on
   * Mr Satan's own card (`Announcer.follow`), word by word on his playhead —
   * one card for the whole screen, as Richard asked, and the same card for
   * the same reason Patchfur borrows it: one speaker, one corner. Asked every
   * frame, so a kitten who walks away mid-sentence gets the rest of it.
   */
  _captionHolo() {
    const a = this.game.announcer;
    const text = this.holoText;
    if (!a?.follow || !text || !this.voice.saying(text)) return;
    const el = this.voice.elOf(text);
    if (a.following(el)) return;
    const far = this.simKittens().some((p) => {
      const q = this._flatPos(p);
      return Math.hypot(q.x - this.layout.lion.x, q.z - this.layout.lion.z) >= LION_NEAR;
    });
    if (!far) return;
    a.follow(el, this.voice.secs(this.voice.idOf(text)), text.replace(/\n/g, ' '), { ...LION_WHO, art: this.lionArt });
  }

  /* ------------------------------ rendering ------------------------------- */

  /** Every billboard the arcade owns, turned to this lens. */
  faceCamera(camera) {
    if (!this.built) return;
    this.lionSprite?.faceCamera(camera);
    this.holoLionSprite?.faceCamera(camera);
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _right.y = 0;
    if (_right.lengthSq() > 1e-6) _right.normalize();
    for (const [, m] of this.bubbles ?? []) this._turnBubble(m, camera);
    this.sign?.quaternion.copy(camera.quaternion);
    if (this.sign) {
      // Only ever turn about Y — a sign that tips back is a sign on a hinge.
      _e.setFromQuaternion(camera.quaternion, 'YXZ');
      // ...plus the hologram's own little sway (`_updateSign`), on top.
      this.sign.rotation.set(this._signTilt ?? 0, _e.y + (this._signSway ?? 0), 0);
    }
    for (const t of this.tubeMats ?? []) t.num.quaternion.copy(camera.quaternion);
    for (const p of this.game.players ?? []) {
      const s = p && this.st[p.index];
      if (!s) continue;
      if (s.puppet?.visible) {
        s.puppetSprite.faceCamera(camera);
        for (const cp of Object.values(s.puppetPoses ?? {})) if (cp.visible) cp.faceCamera(camera);
      }
    }
    this.simDojo?.faceCamera?.(camera);
    if (this.sim && camera.position.x > SIM.dx * 0.5) {
      this.sim.faceCamera(camera);
      this.gallery?.faceCamera(camera);
      this.hall?.faceCamera(camera);
      this.range?.faceCamera(camera);
      this.kata?.faceCamera(camera);
      this.storm?.faceCamera(camera);
      this.sine?.faceCamera(camera);
      this.sentries?.faceCamera(camera);
      this.bamboo?.faceCamera(camera);
      this.school?.faceCamera(camera);
      this.ranks?.faceCamera(camera);
      this.shadow?.faceCamera(camera);
      this.highway?.faceCamera(camera);
      for (const d of this.drills) d?.faceCamera(camera);
      for (const r of this.rundowns) r?.faceCamera(camera);
      for (const s of this.st) s?.bar?.faceCamera(camera);
      for (const [, m] of this.holoBubbles ?? []) this._turnBubble(m, camera);
      for (const t of this.simTubes ?? []) t.num.quaternion.copy(camera.quaternion);
    }
  }

  /** How strong the phase is in a pane — the strongest of its kittens. */
  fxFor(members) {
    let f = 0;
    for (const i of members ?? []) f = Math.max(f, this.st[i]?.fx ?? 0);
    return f;
  }

  /** Lay the phase over a pane that has just been drawn. */
  drawPaneFx(renderer, members, w, h) {
    const f = this.fxFor(members);
    if (f <= 0.001) return;
    if (!this._fx) {
      this._fxU = { uI: { value: 0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2() } };
      const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
        vertexShader: SCREEN_VERT, fragmentShader: RAIN_FRAG, uniforms: this._fxU,
        transparent: true, depthTest: false, depthWrite: false,
      }));
      quad.frustumCulled = false;
      this._fx = new THREE.Scene();
      this._fx.add(quad);
      this._fxCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    }
    this._fxU.uI.value = f;
    this._fxU.uTime.value = this.t;
    this._fxU.uRes.value.set(w, h);
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.render(this._fx, this._fxCam);
    renderer.autoClear = ac;
  }
}

const _right = new THREE.Vector3();
const _grey = new THREE.Color();
const _e = new THREE.Euler();
