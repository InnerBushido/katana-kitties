import * as THREE from 'three';
import { Billboard } from '../core/gfx.js';
import { voicePath } from '../core/audio.js';
import { cssFor } from '../core/palette.js';
import { payneSpot, payneWidth } from '../core/split.js';
import { CLANS } from '../world/world.js';
import { BALL_COUNT, LOCKS } from '../entities/dragonball.js';
import { bubbleTexture } from '../entities/leader.js';
import { toNextTier } from '../entities/panda.js';
import { DOJO_NEED, RIDER_NEED, FEAT_BY_ID } from './feats.js';

/* ---------------------------------------------------------------------------
   PAYNE — the quest giver.

   A REAL PERSON. Payne is a fighter from the Belegarth Medieval Combat
   Society, and Richard asked her before she went in: "I asked her for
   permission to be in the game and will share with her the final results for
   her final approval of course." Everything she says is in `PAYNE_LINES`
   below, in one table, so the script can be read to her in one go — and
   everything about how she looks is in docs/art-masters/payne_*.png. If she
   asks for a change, those two places are the whole of her.

   WHO SHE IS, in Richard's words: "she is funny, confident, and goofy with a
   great personality, very charming, and willing to help players on their
   quest!" — a cat-goblin with green fur, a Gundam helmet she won at the last
   event, and a habit of teasing ("like goblins like to do"). She is a fighter,
   "but is here to guide and teach the players to create mischief and solve
   quests".

   WHAT SHE DOES, and each of these is its own section below:

     1. THE CHAIN. Six of the nine quests in `feats.js`, in the order Richard
        gave: Panda Keeper, Six Oaths, Student of the Circle, Dragon Pilot, Beam
        Gunner, The Very Last One. She always knows the next one and the next
        STEP of it — which shrine, which cane, which dragon ball — and the
        three "most" quests ride along as tag-alongs. `nextStep` is pure, so
        world-check can walk it.
     2. HINTS, OPT-IN. "Players can opt-in to get hints when talking to Payne,
        once opted-in, she will highlight where the player needs to go next
        once a hint is revealed." A kitten who never asks is never nagged. One
        who has asked hears from her after two minutes of no progress, and the
        place goes on her minimap and in the world.
     3. TEASES. Also opt-in, and only the three Richard named: a cub carried
        too long, a kitten lost in a grotto maze, and a kitten hopping at the
        sky shards without the third jump ("she should definitely tease them
        ... and point them to where the triple jump is").
     4. A TRICK. The Goblin Sweep — see `entities/player.js`. Hinted at once a
        kitten is halfway down her list, taught once the list is done and she
        has fought three rounds in the arena.

   HER CARD, NOT THE ANNOUNCER'S. Mr. Satan's and Patchfur's lines go on the
   one `#announce` card, which belongs to the whole screen. Payne's are
   addressed to ONE kitten ("sent to the player on their split screen with
   Payne's face"), so they go in that kitten's pane, sitting on top of the
   warning strip — see `payneSpot` in core/split.js. The QUEUE is still one
   queue, and it waits for his: there is one speaker at a time in this game
   (`Audio.speak` stops whoever was talking), and cutting Mr. Satan off to
   tell somebody where the bamboo is would be the wrong way round.

   THE TEXT IS THE LINE AND THE CLIP IS THE DRESSING, the ninth
   non-negotiable: delete `public/voice/payne/` and every message still
   appears and still holds for its own length.
--------------------------------------------------------------------------- */

/** The chain, in Richard's order. Ids are `FEATS` ids. */
export const CHAIN = ['panda', 'clans', 'dojo', 'pilot', 'rider', 'last'];
/** The tag-alongs: "optional tag along quests like: most dragonballs, most
 *  kotodama orbs, most mischief". */
export const TAG_ALONG = ['mischief', 'balls', 'orbs'];

/** "If players have been stuck on the quest for more than 2 minutes". Then
 *  again every two minutes, three times at most — the `lasthunt` rule: if it
 *  has not landed by the third telling it is not going to. */
export const STUCK_FIRST = 120;
export const STUCK_AGAIN = 120;
export const STUCK_MAX = 3;
/** "having a baby panda for too long, like, more than 2 minutes". */
export const CUB_TEASE = 120;
/** Seconds inside a grotto whose star is still there before she calls it lost.
 *  It was 75, reasoned as "a maze she walks through in under a minute when she
 *  knows the way". Richard: "Lets change the 'Lost in a cave' timing to be
 *  35secs." A nine-year-old who is lost knows it long before 75. */
export const MAZE_TEASE = 35;
/** Take-offs near the sky shards, without a third jump, before she laughs. One
 *  or two is a kitten trying; four is a kitten who has not worked out why. */
export const JUMP_TEASE = 4;
/** How near the sky star counts as "trying to jump up them". */
export const JUMP_NEAR = 26;
/** ...and she laughs once per three minutes at most, however much hopping. */
export const JUMP_COOL = 180;
/** A kitten who has never met her is told she exists: once after a minute and
 *  a half of play, once more after six. Never more — see the header. */
export const INVITE_AT = [90, 360];
/** Where the invitation's map mark stays up, in seconds. */
export const INVITE_MARK = 60;
/** Where she stands: across the road from Mr. Satan's `SATAN_TOWN` (11, 22),
 *  on the way into the market from where the kittens start. */
export const PAYNE_TOWN = { x: -10, z: 24 };
/** How close to talk to her. The dealer's stall is 5; she is one person. */
export const TALK_R = 5.2;
/** Her solid. Grew with her: at 6.0 tall a 0.85 disc let a kitten stand
 *  inside her skirt. */
export const PAYNE_SOLID = 1.25;
/** HER OWN GOBLIN SWEEP, on a kitten who will not stop asking. See `askLast`.
 *  `reach` is talking range and a bit, because the kitten she is sweeping was
 *  standing at her card a moment ago and may have stepped back since. The ring
 *  she draws is this reach: the ring is the hitbox, as it is for a kitten's.
 *  `knock` / `lift` are a gag's, not a fight's: well under Mr. Satan's 34 / 16,
 *  well over a real sweep's 8 / 7.5 - "send them flying backwards". */
export const PAYNE_SHOVE = { reach: 6.4, knock: 15, lift: 9 };
/** How long her spin takes: twice round, a shade slower than a kitten's
 *  `SWEEP_SPIN`, because she is bigger and she means it. */
export const PAYNE_SPIN = 0.5;
/** ...and how long her bubble stays down afterwards: the length of her
 *  complaint, near enough. */
export const PAYNE_HUFF = 10;
/** "once they have completed their quests and have gained some fighting
 *  experience in the arena" — rounds FOUGHT, not won: the youngest sister is
 *  learning the trick too. */
export const TRICK_ROUNDS = 3;
/** "she can hint at (once they have completed some quests)". Half of six. */
export const TEASE_AFTER = 3;
/** How tall she stands, and it is set by her HELMET, not by her height.
 *
 *  Richard, after seeing her: "Payne looks too small in the town, should be
 *  1.5x's bigger at least, her helmet should be as big as a regular players
 *  head at least." She was 3.7, reasoned as "a grown-up who is not a very tall
 *  one" beside a 2.9 kitten — and a kitten is a chibi, nearly half head, so a
 *  realistically proportioned goblin a head taller still had a helmet the size
 *  of a kitten's muzzle. MEASURED off the loaded art:
 *
 *    kitten    head 161 px of a 329 px figure, drawn 2.9  -> 1.42 wide
 *    Payne     helmet 184 px of a 753 px figure, drawn 3.7 -> 0.90 wide
 *
 *  so 6.0 puts the helmet at 1.47, just over a kitten's head, and is 1.62x
 *  what she was. `world-check` re-measures her side off `payne/town.png` and
 *  holds it against `KITTEN_HEAD_W`. */
export const PAYNE_HEIGHT = 6.0;
/** A kitten's head, measured in the browser off Ember's atlas cell (see
 *  above). A number and not a measurement at runtime because the atlas only
 *  exists in a browser; the check says where it came from. */
export const KITTEN_HEAD_W = 1.42;
/** Payne's town art, measured: the helmet's widest row as a fraction of her
 *  figure's height. world-check re-derives this from the PNG. */
export const HELMET_FRAC = 184 / 753;
/** HER BUBBLE HANGS BESIDE HER HEAD, NOT OVER IT. At 6.0 tall a bubble over
 *  her head (it was height + 2.2) put its top at NDC y 1.07-1.13 at every
 *  talking distance: off the screen, under the HUD chip. Her helmet's top is at
 *  0.57-0.70, so the bubble moves to her side, level with her face. */
const BUBBLE_Y = PAYNE_HEIGHT * 0.84;
/** Where the tail's POINT goes, and the bubble hangs off it: level with her
 *  helmet, just outside its edge. `BUBBLE_Y` was the bubble's middle, and its
 *  tail came out of the bottom and pointed at the grass beside her. */
export const BUBBLE_TIP = { y: PAYNE_HEIGHT * 0.86, out: KITTEN_HEAD_W * 0.55 + 0.35 };
/** How far out from her middle the bubble's near edge sits: clear of her
 *  helmet and the sword over her shoulder. */
const BUBBLE_GAP = BUBBLE_TIP.out;
const _right = new THREE.Vector3();
/** Held after her last word, the announcer's rule. */
const HOLD_TAIL = 0.9;
/** A message with no clip at all holds by its length — the toast's rule. */
const SILENT_BASE = 2.6;
const SILENT_PER_CHAR = 0.05;
/** How long a clip she has just said stays "just said". Richard: "She should
 *  not repeat herself, if she just said something to someone, she shouldn't
 *  repeat the same thing again for the other player. If she says players
 *  specific name, then that counts as a new voice speech and doesn't count as
 *  being repeated." Half a minute is two sisters at her card at once; a kitten
 *  who comes back later to ask again hears it again. */
export const SAID_RECENTLY = 30;
/** "Heyyy, Ember!" and "Oi! Frost!" - a NAME is never a repeat. */
const isNameClip = (id) => /^payne_(hey|oi)_/.test(id);

/** Her card's dressing. Goblin green — nothing else in the HUD is green, and
 *  "which of the grown-ups is this" is answered by colour everywhere else
 *  (Mr. Satan gold, Patchfur parchment). */
export const PAYNE_WHO = { name: 'PAYNE', sub: 'Goblin', colour: '#7fd35a' };

/**
 * Where to find her face on each of her drawings: `[x, y, size]` on the baked
 * 768px file. MEASURED — cropped out of the proof and looked at — not worked
 * out from the ink box, which on `town` is the top of a helmet horn.
 *
 * TWO FACES, AND WHICH ONE IS A STORY DECISION. Richard: "I plan to reveal her
 * face at the end of the game". So all afternoon her portrait is the helmet,
 * and from the Awakening on it is her face — the same frame the billboard in
 * the market swaps `town` for `held`. `held` was generated off `base` and
 * keeps its framing to the pixel, so the one crop serves both.
 */
export const PAYNE_ART = {
  town: { src: '/sprites/payne/town.png', face: [258, 6, 230] },
  held: { src: '/sprites/payne/held.png', face: [283, 14, 210] },
  sweep: { src: '/sprites/payne/sweep.png' },
};

/**
 * Everything she says. THE SCRIPT, and the one thing Payne herself should be
 * shown before this ships.
 *
 * WRITTEN FOR A VOICE WITH NO DIRECTION FIELD. `text2speech_v2` with a preset
 * takes the text and the voice and nothing else (docs/notes/voices.md), so the
 * punctuation is the performance. She is Pixie.
 *
 * NAMES ARE THEIR OWN CLIPS. "Payne can say the players name when sending the
 * message, so let's record her saying all the players names." Two per kitten,
 * because she says a name two ways: `hey` when she is helping, `oi` when she
 * is teasing. The line after it never has the name in it, so one recording of
 * "your cub's hungry" serves all four sisters.
 */
export const PAYNE_LINES = {
  payne_hey_ember: 'Heyyy, Ember!',
  payne_hey_frost: 'Heyyy, Frost!',
  payne_hey_storm: 'Heyyy, Storm!',
  payne_hey_blossom: 'Heyyy, Blossom!',
  payne_oi_ember: 'Oi! Ember!',
  payne_oi_frost: 'Oi! Frost!',
  payne_oi_storm: 'Oi! Storm!',
  payne_oi_blossom: 'Oi! Blossom!',

  payne_hello: "I'm Payne! Goblin, fighter, and the best quest-giver in the whole sky. "
    + "Stick with me, kitten — we're gonna make SO much mischief.",
  payne_back: "You're back! Missed me? Course you did.",
  payne_invite: "Psst! Come and find me in the town. I've got quests for you!",
  payne_bye: 'Go make some mischief!',

  /* What each quest IS, said when she is asked "what's my next quest?". */
  payne_q_panda: 'First job: get yourself a panda! Swear to Pandapaw on the bamboo island, '
    + 'then cut bamboo until your little cub is all grown up.',
  payne_q_clans: "Six clans, six oaths! Go and swear to every single one. I'll tell you who's still waiting.",
  payne_q_dojo: 'School time! Stand in the Dojo of the Turning Circle and watch the numbers go round. '
    + 'Forty-five seconds. No wiggling. Okay, a little wiggling.',
  payne_q_pilot: 'Wanna fly a real dragon? Find all seven dragon balls, call Ryuuseki, and hop in the front seat!',
  payne_q_rider: "Climb into Ryuuseki's back seat and blast that beam! Forty-five seconds — and you have to be first!",
  payne_q_last: "Last one, and it's a race! Whoever knocks over the very last thing in the whole sky wins it. "
    + 'Go, go, go!',
  payne_q_done: "You did every single one of my quests?! Okay. Okay, I'm impressed. Don't tell anyone.",
  payne_q_closed: "That door's shut now, kitten. But look at everything you DID do!",

  /* Where to go NEXT — the hint, and every one of them says the map. */
  payne_h_pandapaw: 'The Pandapaw shrine is on the bamboo island. I put a mark on your map — go on!',
  payne_h_bamboo: "Your cub's hungry! There's bamboo on your map. Chop chop! Get it? Chop chop.",
  payne_h_shrine: "There's a clan you haven't met yet! It's on your map — go and say hi.",
  payne_h_ice: "Just Icewhisker left! Snowmantle's out on the frozen island. She's on your map.",
  payne_h_dojo: "The Dojo's on your map! Go and stand in the circle, and be the point.",
  payne_h_ball: "There's a dragon ball out there with your name on it. I marked it for you!",
  payne_h_torii: "Seven balls! Go to the big red gate and call the dragon. It's on your map!",
  payne_h_ryu_front: "Ryuuseki's waiting for you! Hop in the front seat. I marked him.",
  payne_h_ryu_back: "The back seat's free! Climb on behind the pilot and fire that beam!",
  payne_h_last: "Something's still standing! I put the nearest one on your map. Smash it!",

  /* THE VERY LAST ONE, asked about again and again — `askLast`. Richard:
     "...Payne should tell the player that she should go to Icewhisker and get
     the Sense Mischief ability..." and then, to a kitten who HAS it, "Are you
     serious with me? You already have Sense Mischief ability, you know where
     you need to go!" with "some extra funny comments and complaints... maybe
     she can even swear in goblin speak". The goblin is nonsense on purpose:
     the audience is nine and younger. */
  payne_last_ice: 'Psst. Goblin secret! Icewhisker has a trick called Sense Mischief. It points right at '
    + 'the nearest thing still standing! Go and swear to her, out on the frozen island. I marked her on your map.',
  payne_last_ice2: "Icewhisker! Frozen island! She's STILL on your map. Go, go, go!",
  payne_last_mad1: 'Are you serious with me? You already have the Sense Mischief ability! You know where you '
    + "need to go! ... Snargle-blarg! Fizzwick-GRUNKLE-bonk! ... Hmph. That's goblin. Don't repeat it.",
  payne_last_mad2: 'AGAIN?! Okay. Look. See the arrow? The big, pointy, floaty ARROW? It points at the '
    + "mischief. That is its WHOLE JOB! ... Grrrrr... Blorka-snazz-FRAZZLE-flumph! ... Right. That's it. "
    + 'Goblin... SWEEEEP!',
  payne_last_mad3: 'You AGAIN?! Nope. Nope, nope, nope! Zibble-GRONK! Goblin... SWEEEEP!',
  payne_last_swept: 'And STAY swept! Follow the ARROW! ... Kittens. Honestly. I have a helmet to polish, you know.',

  /* The teases — "like goblins like to do". */
  payne_t_cub: "Still carrying a baby panda around? Aww, it's cute. It's also HUNGRY! "
    + "There's bamboo on your map.",
  payne_t_maze: 'Lost in the cave? Ha! Keep one paw on the wall and just follow it. Works every time. Mostly.',
  payne_t_jump: "Ha! You can't jump that high with only two jumps, silly! Shadowtail teaches the triple jump, "
    + 'over on the ash island. I marked it!',
  payne_t_slow: "Hellooo? Did you fall asleep? That quest isn't gonna do itself!",

  payne_trick_tease: "Finish my quests, then fight three rounds in the arena... and I'll teach you a secret goblin move.",
  payne_trick_ready: "You're ready! Come and find me in the town. I've got something sneaky to teach you.",
  payne_trick_teach: 'Okay. Secret goblin move. Hold run, stand really still... and swing! '
    + "That's the Goblin Sweep. Everything around you goes flying!",
  payne_hints_on: "Hints on! If you get stuck, I'll find you. Goblins always find you.",
  payne_hints_off: "Hints off! Big kitten. I'll be right here if you need me.",
};

/** Every clip she can play, id -> url, for `Announcer.load`. */
export const PAYNE_CLIPS = Object.fromEntries(Object.keys(PAYNE_LINES).map((id) => [id, voicePath(id)]));

/** Which step says which hint line. A step with no line of its own (there is
 *  none today) falls back to the quest's own. */
export const STEP_LINE = {
  pandapaw: 'payne_h_pandapaw', bamboo: 'payne_h_bamboo', shrine: 'payne_h_shrine',
  ice: 'payne_h_ice', dojo: 'payne_h_dojo', ball: 'payne_h_ball', torii: 'payne_h_torii',
  ryu_front: 'payne_h_ryu_front', ryu_back: 'payne_h_ryu_back', last: 'payne_h_last',
};

/** Which island each clan's shrine is on, for the card's sentence. The same
 *  six that `World._buildShrines` places, by clan id. */
export const CLAN_ISLE = {
  thunder: 'the home island', river: 'the autumn island', shadow: 'the ash island',
  wind: 'the dusk island', ice: 'the frozen island', panda: 'the bamboo island',
};

/* ------------------------------ the ledger ------------------------------- */

/** One kitten's history with her. Every field survives a save and a drop-out.
 *  `told` and `teased` are the two once-only announcements, so a load does
 *  not make her say them again. */
export const blankPayne = () => ({
  met: false, hints: false, sweep: false, rounds: 0, told: false, teased: false,
  /* The Very Last One's conversation, which has a memory — `askLast`. How many
     times she has pressed MARK IT on that quest, whether she has been sent to
     Icewhisker, and how many times Payne has lost her temper since. Saved, so
     a load does not hand a kitten who has been swept a fresh, patient Payne. */
  lastAsks: 0, iceTold: false, mad: 0,
});

const count = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

export function cleanPayne(r) {
  const b = blankPayne();
  if (!r || typeof r !== 'object') return b;
  for (const k of ['met', 'hints', 'sweep', 'told', 'teased', 'iceTold']) b[k] = !!r[k];
  for (const k of ['rounds', 'lastAsks', 'mad']) b[k] = count(r[k]);
  return b;
}

export function payneOf(p) {
  if (!p) return blankPayne();
  if (!p.payne) p.payne = blankPayne();
  return p.payne;
}

/* ------------------------------ the chain -------------------------------- */

const styleName = (p) => p?.style?.name ?? p?.name ?? '?';

/**
 * Where one quest stands for one kitten.
 *   done    she has it
 *   taken   a one-kitten quest somebody else got first
 *   closed  the Awakening has shut the door on it (see `Feats.open`)
 *   open    still to do
 *
 * ASKED OF `Feats`, NEVER WORKED OUT AGAIN HERE. Her checklist and the profile
 * screen's must never disagree about whether a quest is done.
 */
export function questState(g, p, id) {
  const F = g.feats;
  if (F?.has?.(p, id)) return 'done';
  if (F && !F.open) return 'closed';
  if (id === 'rider' && F?.claimed?.rider && F.claimed.rider !== styleName(p)) return 'taken';
  return 'open';
}

/** The first quest in her chain still to do, or null when it is all settled. */
export function currentQuest(g, p) {
  return CHAIN.find((id) => questState(g, p, id) === 'open') ?? null;
}

/** How many of the six are settled — done, taken or closed. */
export function settledCount(g, p) {
  return CHAIN.filter((id) => questState(g, p, id) !== 'open').length;
}

/** How many she has actually DONE, which is what the card counts. */
export function doneCount(g, p) {
  return CHAIN.filter((id) => questState(g, p, id) === 'done').length;
}

/**
 * Has she earned the trick?
 *
 * ALL SIX SETTLED, AND THREE ROUNDS. "Settled", not "done": the Very Last One
 * goes to exactly one kitten and the door shuts on everything at the
 * Awakening, so "every quest done" is a trick three sisters out of four could
 * never learn. What she has to have done is SEE THE LIST THROUGH — and because
 * the Very Last One only settles at the Awakening, that means the trick is an
 * after-the-ending thing, which is also when her face comes out from under the
 * helmet and why the sweep drawing shows it.
 */
export function trickReady(g, p) {
  return settledCount(g, p) >= CHAIN.length && payneOf(p).rounds >= TRICK_ROUNDS;
}

const flat = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

function nearest(list, from) {
  let best = null;
  let bestD = Infinity;
  for (const o of list) {
    const d = flat(o, from);
    if (d < bestD) { bestD = d; best = o; }
  }
  return best;
}

/** The world positions of every standing bamboo cane. */
function standingBamboo(world) {
  return (world?.props ?? [])
    .filter((pr) => pr.kind === 'bamboo' && !pr.scored)
    .map((pr) => ({ x: pr.group.position.x, z: pr.group.position.z, y: pr.group.position.y, prop: pr }));
}

/** The nearest dragon ball not yet found. */
function nextBall(world, from) {
  const balls = (world?.dragonBalls ?? []).filter((b) => !b.taken)
    .map((b) => ({ x: b.position.x, z: b.position.z, y: b.position.y, ball: b }));
  return nearest(balls, from);
}

/**
 * The next thing to DO: which quest, which step of it, and where.
 *
 * PURE — it reads the game and changes nothing — so world-check can put a
 * kitten in any state and ask. Returns null when her chain is settled.
 *
 * @returns {?{quest: string, key: string, line: string, target: ?{x,y,z},
 *   where: string, sig: string}}
 *   `key` names the step (and its hint line); `sig` changes whenever she makes
 *   ANY progress on it, which is what the two-minute clock is reset by —
 *   stuck means nothing moved, not merely that the step is the same.
 */
export function nextStep(g, p) {
  const quest = currentQuest(g, p);
  if (!quest) return null;
  const world = g.world;
  const from = p.position;
  const hall = (id) => (world?.clanHalls ?? []).find((h) => h.clan.id === id) ?? null;
  const at = (o) => (o ? { x: o.x, y: o.y ?? 0, z: o.z } : null);
  const out = (key, target, where, sig) => ({
    quest, key, line: STEP_LINE[key], target: at(target), where, sig: String(sig),
  });

  switch (quest) {
    case 'panda': {
      if (!p.clansSworn?.has('panda')) {
        return out('pandapaw', hall('panda'), 'Swear to Pandapaw — Bambooheart, on the bamboo island.', 0);
      }
      const cane = nearest(standingBamboo(world), from);
      /* THE BADGE'S OWN NUMBER — `toNextTier` is the one place the ladder is
         priced, and a card that counted canes its own way would be a second
         price for the same panda. */
      const left = toNextTier(p.bambooCut ?? 0, p.pandaFedFrom ?? null, p.panda?.tier ?? -1);
      return out('bamboo', cane,
        cane ? `Cut bamboo for your panda — ${left} more ${left === 1 ? 'cane' : 'canes'} until it grows.`
          : 'There is no bamboo left standing anywhere.',
        `${p.bambooCut ?? 0}:${p.panda?.tier ?? -1}`);
    }
    case 'clans': {
      /* ICEWHISKER LAST. "point the player to the next one they need to go to
         with Sense Mischief being the last one if not yet visited" — she is
         the clan that helps find the last pieces of mischief, so she is the
         one worth saving for when that is the job. */
      const unsworn = CLANS.filter((c) => !p.clansSworn?.has(c.id));
      const others = unsworn.filter((c) => c.id !== 'ice');
      const halls = (others.length ? others : unsworn).map((c) => hall(c.id)).filter(Boolean);
      const h = nearest(halls, from);
      const n = p.clansSworn?.size ?? 0;
      if (!h) return out('shrine', null, `${n} of ${CLANS.length} oaths sworn.`, n);
      const key = h.clan.id === 'ice' ? 'ice' : 'shrine';
      return out(key, h, `Swear to ${h.clan.name}, on ${CLAN_ISLE[h.clan.id] ?? 'an island'} `
        + `— ${n} of ${CLANS.length} sworn.`, n);
    }
    case 'dojo': {
      const L = g.feats?.ledger?.(p);
      const t = Math.floor(L?.dojoT ?? 0);
      return out('dojo', world?.dojoCentre ?? null,
        `Stand in the Dojo of the Turning Circle — ${t} of ${DOJO_NEED} seconds.`, Math.floor(t / 5));
    }
    case 'pilot':
    case 'rider': {
      const L = g.feats?.ledger?.(p);
      const tick = quest === 'rider' ? Math.floor((L?.riderT ?? 0) / 5) : 0;
      const held = g.ballsHeld ?? 0;
      const sig = `${held}:${g.ryu ? 1 : 0}:${tick}`;
      if (g.ryu) {
        return quest === 'pilot'
          ? out('ryu_front', g.ryu.position, "Get in Ryuuseki's FRONT seat and fly him.", sig)
          : out('ryu_back', g.ryu.position,
            `Ride Ryuuseki's BACK seat — ${Math.floor(L?.riderT ?? 0)} of ${RIDER_NEED} seconds.`, sig);
      }
      if (held >= BALL_COUNT) {
        return out('torii', g._toriiSpot?.() ?? { x: 0, y: 0, z: -46 },
          'All seven! Take them to the big red gate and call the dragon.', sig);
      }
      const b = nextBall(world, from);
      const hint = b ? LOCKS[b.ball.lock]?.hint : null;
      return out('ball', b, `Find the dragon balls — ${held} of ${BALL_COUNT}`
        + `${hint ? `. The nearest: ${hint.toLowerCase()}` : ''}.`, sig);
    }
    case 'last':
    default: {
      /* THE SAME PROP THE MINIMAP AND ICEWHISKER'S CHEVRON POINT AT —
         `Game._updateSeek` already solves "nearest unscored prop to this
         kitten", and a second answer could disagree with the first. */
      const t = p.seekTarget && !p.seekTarget.scored ? p.seekTarget.group.position : null;
      const L = g.feats?.ledger?.(p);
      return out('last', t, 'Knock things over — and be the one who gets the very LAST one.',
        L?.mischief ?? 0);
    }
  }
}

/**
 * Her checklist for one kitten: the six, then the tag-alongs.
 *
 * THE TAG-ALONGS ARE READ OFF `Feats.status`, which already works out who is
 * in the lead on each — a second copy of that rule would be a second chance
 * for the two screens to disagree about who is winning.
 */
export function questList(g, p) {
  const rows = CHAIN.map((id) => {
    const f = FEAT_BY_ID[id];
    return { id, icon: f.icon, title: f.title, how: f.how, state: questState(g, p, id), tag: false };
  });
  const status = g.feats?.status?.(p) ?? [];
  for (const id of TAG_ALONG) {
    const s = status.find((r) => r.feat.id === id);
    const f = FEAT_BY_ID[id];
    rows.push({
      id, icon: f.icon, title: f.title, how: f.how, tag: true,
      state: s?.got ? 'done' : (s?.star ? 'lead' : 'open'),
      note: s?.note ?? '',
    });
  }
  return rows;
}

/* --------------------------------- art ----------------------------------- */

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Load her raw drawings for the portrait crops. A failure leaves `null` and
 *  the card draws without a face — prefer a rule that degrades. */
function loadImage(src) {
  if (typeof Image === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/* ------------------------------ the guide -------------------------------- */

export class Payne {
  constructor(game) {
    this.game = game;
    /** Per-kitten transient state — timers, marks. NOT saved: a load is a
     *  fresh two minutes, which is what "stuck" means. Keyed by the Player. */
    this.st = new WeakMap();
    /** Messages waiting their turn, and the one being said. */
    this.queue = [];
    this.current = null;
    /** Clip id -> `this.t` when she last started saying it. See `SAID_RECENTLY`. */
    this.said = new Map();
    /** Kitten -> { text, until }: words shown on her card WITHOUT the voice,
     *  because the voice would be a repeat. Never queued - see `say`. */
    this.caption = new Map();
    /** Raw images for her face, filled by `loadArt`. */
    this.img = {};
    /** The billboards in the market. Built by `spawn`. */
    this.group = null;
    this.position = null;
    /** Has her face come out? Follows `kotodama.awakened` — see `_reveal`. */
    this.revealed = false;
    this.t = 0;
    this.host = typeof document !== 'undefined' ? document.getElementById('payne-hints') : null;
    this.cardEls = [];
    this.beacons = new Map();
    /* HER SWEEP'S RING IS A KITTEN'S RING. `SweepFx` polls anything with a
       position and a `sweepSeq`, so she is handed to it as one more sweeper
       rather than growing a second ring that could drift from the first. */
    this.sweeper = {
      position: null, sweepSeq: 0, sweepReach: PAYNE_SHOVE.reach, style: { colour: 0xfff4dd },
    };
    this.spinT = 0;
    /** Seconds she is still in a huff after sweeping somebody. */
    this.huffT = 0;
  }

  ledger(p) { return payneOf(p); }

  /** This kitten's transient state. */
  _s(p) {
    let s = this.st.get(p);
    if (!s) {
      s = {
        sig: '', stuck: 0, nextAt: STUCK_FIRST, count: 0, mark: null, step: null, stepT: 0,
        cubT: 0, cubTier: null, cubTold: false, caveT: 0, caveTold: false,
        hops: 0, wasGround: true, jumpCool: 0, override: null,
        playT: 0, invites: 0, inviteT: 0,
      };
      this.st.set(p, s);
    }
    return s;
  }

  async loadArt() {
    const [town, held, sweep] = await Promise.all(
      [PAYNE_ART.town.src, PAYNE_ART.held.src, PAYNE_ART.sweep.src].map(loadImage));
    this.img = { town, held, sweep };
  }

  /* ------------------------------ in the town ----------------------------- */

  /**
   * Stand her in the market.
   *
   * @param {object} townArt  atlas of `town.png` (wearing the helmet)
   * @param {object} heldArt  atlas of `held.png` (holding it — after the ending)
   * @param {{x:number, z:number}} spot  where, already cleared by the caller
   */
  spawn(townArt, heldArt, spot) {
    const g = this.game;
    const ground = g.world?.heightAt?.(spot.x, spot.z);
    this.position = new THREE.Vector3(spot.x, ground ? ground.y : 0, spot.z);
    this.sweeper.position = this.position;
    this.group = new THREE.Group();
    this.group.position.copy(this.position);
    const mk = (art) => {
      const quad = PAYNE_HEIGHT / (art.contentScale || 1);
      /* FRONT-FACING, NEVER MIRRORED — the clan leaders' rule, for the same
         reason: one drawing with a helmet under ONE arm must not swap arms
         when the camera walks round her. */
      const b = new Billboard(art.texture, {
        cols: 1, rows: 1, width: quad, height: quad, footOffset: (art.pad ?? 0) * quad, mirror: false,
      });
      this.group.add(b);
      return b;
    };
    this.townSprite = mk(townArt);
    this.heldSprite = heldArt ? mk(heldArt) : null;
    if (this.heldSprite) this.heldSprite.visible = false;

    const sg = new THREE.CircleGeometry(0.85 * PAYNE_HEIGHT / 3.7, 18);
    sg.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(sg, new THREE.MeshBasicMaterial({
      color: 0x2a1830, transparent: true, opacity: 0.34, depthWrite: false,
    }));
    this.group.add(this.shadow);

    /* HER BUBBLE SAYS WHAT SHE IS FOR, before anybody has met her — the
       leaders' bubble does the same job at a shrine. Two bubbles, because
       once you have met her the invitation is the wrong sentence. */
    this.bubbles = ['Heyyy! I\'m Payne.\nQuests and hints —\ncome and talk to me!',
      'Stuck? Need a hint?\nCome and talk to me!'].map((text) => {
      const { texture, aspect, tip } = bubbleTexture(text, PAYNE_WHO.colour, { tail: 'left' });
      const BH = 2.8;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(BH * aspect, BH), new THREE.MeshBasicMaterial({
        map: texture, transparent: true, opacity: 0, depthWrite: false, depthTest: false,
        toneMapped: false, side: THREE.DoubleSide,
      }));
      m.position.y = BUBBLE_Y;
      m.userData.w = BH * aspect;
      /* Where the tail's point is, from the bubble's middle, unscaled. */
      m.userData.tipY = BH * (0.5 - tip.v);
      m.renderOrder = 24;
      m.visible = false;
      this.group.add(m);
      return m;
    });
    this.show = 0;
    g.scene?.add(this.group);
    /* A SOLID, the leaders' size, so a kitten cannot stand inside her. */
    g.world?.solids?.push({ x: spot.x, z: spot.z, r: PAYNE_SOLID });
  }

  /** Could this kitten talk to her right now? On foot, near, nothing up. */
  canTalk(p) {
    if (!this.position || !p) return false;
    if (p.mount || p.rideAlong || p.pandaMount || p.angel || p.carried || p.ko) return false;
    return flat(p.position, this.position) < TALK_R;
  }

  faceCamera(camera) {
    if (!this.group) return;
    this.townSprite?.faceCamera(camera);
    this.heldSprite?.faceCamera(camera);
    /* BESIDE HER HEAD, ON THIS LENS'S RIGHT. Each pane turns the bubble
       to itself and slides it along its OWN right vector, so four cameras
       from four sides all see it next to her rather than behind her. */
    _right.set(1, 0, 0).applyQuaternion(camera.quaternion);
    _right.y = 0;
    if (_right.lengthSq() > 1e-6) _right.normalize();
    for (const b of this.bubbles ?? []) {
      b.quaternion.copy(camera.quaternion);
      const off = BUBBLE_GAP + (b.userData.w ?? 4) * b.scale.x * 0.5;
      b.position.x = _right.x * off;
      b.position.z = _right.z * off;
    }
  }

  /** The face reveal: from the Awakening on, the helmet is under her arm. */
  _reveal(on) {
    if (this.revealed === on) return;
    this.revealed = on;
    if (this.heldSprite) {
      this.heldSprite.visible = on;
      this.townSprite.visible = !on;
    }
  }

  _updateNpc(dt) {
    if (!this.group) return;
    const g = this.game;
    this._reveal(!!g.kotodama?.awakened);
    let near = false;
    let anyMet = true;
    /* AND GONE ONCE SOMEBODY IS CLOSE ENOUGH TO TALK. The bubble is an
       invitation from across the square; at talking range the kitten's own
       "TALK TO PAYNE" prompt says the same thing, and beside her head the
       bubble sat right on top of it (measured in the browser at 3.5 units). */
    let talking = false;
    for (const p of g.players ?? []) {
      if (!p || p.mount) continue;
      const d = flat(p.position, this.position);
      if (d < 11) {
        near = true;
        if (!this.ledger(p).met) anyMet = false;
      }
      if (d < TALK_R) talking = true;
    }
    /* ...AND NOT WHILE SHE IS IN A HUFF. Measured in the browser: the frame
       after she swept a kitten across the square, her bubble offered that
       same kitten "Stuck? Need a hint? Come and talk to me!". */
    this.huffT = Math.max(0, this.huffT - dt);
    if (talking || this.huffT > 0) near = false;
    this.show += ((near ? 1 : 0) - this.show) * Math.min(1, dt * 5);
    this.bubbles.forEach((b, i) => {
      const on = (i === 0) === !anyMet;
      b.visible = on && this.show > 0.02;
      b.material.opacity = this.show;
      b.scale.setScalar(0.7 + this.show * 0.3);
      b.position.y = BUBBLE_TIP.y - (b.userData.tipY ?? 0) * b.scale.x + Math.sin(this.t * 1.6) * 0.16;
    });
    /* A goblin does not stand still. Faster and bouncier than a leader's
       breathing, because that is who she is. */
    const s = this.revealed ? this.heldSprite : this.townSprite;
    /* HER SWEEP IS A SPIN, TWICE ROUND, the way a kitten's is her facing
       turned twice round: she has one front-facing drawing, so the turn is the
       card narrowing to its edge and opening again, mirrored on the back half. */
    this.spinT = Math.max(0, this.spinT - dt);
    const spin = this.spinT > 0 ? Math.cos((1 - this.spinT / PAYNE_SPIN) * Math.PI * 4) : 1;
    if (s) {
      s.mesh.scale.set((1 - Math.sin(this.t * 2.4) * 0.015) * spin, 1 + Math.sin(this.t * 2.4) * 0.022, 1);
      s.mesh.rotation.z = Math.sin(this.t * 1.1) * 0.035;
    }
    this.group.position.y = this.position.y + Math.abs(Math.sin(this.t * 1.2)) * 0.06;
  }

  /* ------------------------------ per frame ------------------------------- */

  /** Is this a moment when she must say nothing? */
  _quiet() {
    const g = this.game;
    return !!(g._sceneActive?.() || g._finaleDue || g.paused || g.profile?.active
      || g.tournament?.active || g.summonScene?.active || g.announcer?.hushed);
  }

  update(dt) {
    const g = this.game;
    this.t += dt;
    this._updateNpc(dt);
    const quiet = this._quiet();
    for (const p of g.players ?? []) if (p) this._watch(p, dt, quiet);
    this._voice(dt, quiet);
    this._beacons(dt);
  }

  /** The step for this kitten, re-solved four times a second — it is a
   *  distance test over the props and the stars, and a mark that twitches
   *  between two equidistant canes is worse than one that lags a little. */
  step(p, dt = 0) {
    const s = this._s(p);
    s.stepT -= dt;
    if (!s.step || s.stepT <= 0) {
      s.step = nextStep(this.game, p);
      s.stepT = 0.25;
    }
    return s.step;
  }

  _watch(p, dt, quiet) {
    const g = this.game;
    const L = this.ledger(p);
    const s = this._s(p);
    s.jumpCool = Math.max(0, s.jumpCool - dt);
    s.inviteT = Math.max(0, s.inviteT - dt);
    const step = this.step(p, dt);
    /* A MARK OUTLIVES A STEP ONLY WHILE IT IS STILL THAT STEP. Cutting another
       cane keeps "bamboo" marked and moves the mark to the next cane; swearing
       at Pandapaw moves her to a different step and the old mark goes. */
    if (s.mark && (!step || s.mark !== `${step.quest}:${step.key}`)) s.mark = null;
    if (s.override && (s.override.until?.(p) || (s.override.t -= dt) <= 0)) s.override = null;
    /* The Very Last One's marks have no clock (they last until the prop goes
       over, or until she has the arrow), so they go with the QUEST: after the
       Awakening an Icewhisker mark on a kitten who never went back would
       otherwise stand on her map all evening. */
    if (s.override?.quest === 'last' && step?.quest !== 'last') s.override = null;
    /* NOTHING LEFT TO HINT AT, SO HINTS ARE OFF — see `rows`, which stops
       offering the switch at the same moment. Written down rather than only
       hidden, so a save taken after the ending does not carry a switch that
       is on and can never be reached again. */
    if (L.hints && !currentQuest(g, p)) L.hints = false;
    if (quiet || g.inspector?.busy?.(p.index)) return;

    /* --- the two once-only lines, for anybody who has met her --- */
    if (L.met && !L.sweep && !L.told && trickReady(g, p)) {
      L.told = true;
      this.say(p, ['payne_trick_ready'], 'hey');
    } else if (L.met && !L.sweep && !L.teased && !trickReady(g, p) && doneCount(g, p) >= TEASE_AFTER) {
      L.teased = true;
      this.say(p, ['payne_trick_tease'], 'hey');
    }

    /* --- never met: tell her Payne exists, twice at most ---
       AND ONLY WHILE SHE HAS A QUEST TO GIVE. Reported: "Payne is calling for
       players that just spawned to see her, even though the Quests are over."
       A kitten seated after the Awakening has every door shut (`nextStep` is
       null), and "I've got quests for you!" was a promise with nothing behind
       it. `step` is the same answer her card would give, so the invitation
       cannot disagree with what she says when you arrive. */
    if (!L.met) {
      if (!step) return;
      s.playT += dt;
      if (s.invites < INVITE_AT.length && s.playT >= INVITE_AT[s.invites]) {
        s.invites += 1;
        if (!this.position || flat(p.position, this.position) > 25) {
          s.inviteT = INVITE_MARK;
          this.say(p, ['payne_invite'], 'hey');
        }
      }
      return;
    }
    if (!L.hints || !step) return;

    /* --- stuck: two minutes of nothing moving --- */
    const sig = `${step.quest}:${step.key}:${step.sig}`;
    if (sig !== s.sig) { s.sig = sig; s.stuck = 0; s.count = 0; s.nextAt = STUCK_FIRST; }
    s.stuck += dt;
    if (s.stuck >= s.nextAt && s.count < STUCK_MAX) {
      s.count += 1;
      s.nextAt += STUCK_AGAIN;
      /* THE SECOND TIME, SHE TEASES FIRST. "Maybe even tease you ... if you
         are taking too long" — and then still tells you, because a tease that
         does not help is just being mean. */
      if (s.count === 2) this.say(p, ['payne_t_slow', step.line], 'oi');
      else this.say(p, [step.line], 'hey');
      this.markNow(p);
    }

    /* --- the three teases Richard named --- */
    // 1. A cub carried too long.
    const cub = step.quest === 'panda' && p.panda && !p.panda.spec?.rideable;
    if (cub && s.cubTier !== p.panda.tier) { s.cubTier = p.panda.tier; s.cubTold = false; s.cubT = 0; }
    s.cubT = cub ? s.cubT + dt : 0;
    if (cub && !s.cubTold && s.cubT >= CUB_TEASE) {
      s.cubTold = true;
      this.say(p, ['payne_t_cub'], 'oi');
      s.mark = `${step.quest}:${step.key}`;
    }
    // 2. Lost in a grotto whose star is still there.
    const G = g.world?.grottoAt?.(p.position.x, p.position.z);
    const caveBall = G && (g.world.dragonBalls ?? []).some(
      (b) => !b.taken && Math.hypot(b.position.x - G.x, b.position.z - G.z) < G.r);
    if (caveBall) s.caveT += dt; else { s.caveT = 0; s.caveTold = false; }
    if (caveBall && !s.caveTold && s.caveT >= MAZE_TEASE) {
      s.caveTold = true;
      this.say(p, ['payne_t_maze'], 'oi');
    }
    // 3. Hopping at the sky shards with only two jumps.
    const sky = (g.world?.dragonBalls ?? []).find((b) => b.lock === 'sky' && !b.taken);
    const tryingSky = sky && (p.maxJumps ?? 2) < 3 && !p.mount
      && flat(p.position, sky.position) < JUMP_NEAR;
    if (tryingSky) {
      if (s.wasGround && !p.onGround) s.hops += 1;
    } else s.hops = 0;
    s.wasGround = !!p.onGround;
    if (tryingSky && s.hops >= JUMP_TEASE && s.jumpCool <= 0) {
      s.hops = 0;
      s.jumpCool = JUMP_COOL;
      this.say(p, ['payne_t_jump'], 'oi');
      const h = (g.world?.clanHalls ?? []).find((x) => x.clan.id === 'shadow');
      /* THE MARK POINTS AT DUSKCOAT, NOT AT THE STAR. The star is right there;
         what she cannot find is the reason she cannot reach it. Held until she
         has the third jump, or for four minutes. */
      if (h) s.override = { x: h.x, z: h.z, t: 240, until: (q) => (q.maxJumps ?? 2) >= 3 };
    }
  }

  /**
   * Where this kitten's map should be pointing, or null.
   *
   * IN ORDER: a tease's own mark (Duskcoat, for the triple jump), then a hint
   * she has been given, then — for a kitten who has never met her — Payne
   * herself for a minute after the invitation.
   */
  goalFor(p) {
    if (!p) return null;
    const s = this._s(p);
    if (s.override) return { x: s.override.x, z: s.override.z, y: s.override.y };
    if (s.mark) {
      const step = this.step(p);
      if (step?.target && s.mark === `${step.quest}:${step.key}`) return step.target;
    }
    if (s.inviteT > 0 && this.position) return { x: this.position.x, z: this.position.z };
    return null;
  }

  /** Put the current step on her map now — the card's MARK IT row, and what
   *  turning hints on does straight away. */
  markNow(p) {
    const s = this._s(p);
    s.step = null;             // solve it fresh: she is asking about NOW
    const step = this.step(p);
    if (!step?.target) return false;
    if (step.quest === 'last') return this._pinLast(p, step);
    s.mark = `${step.quest}:${step.key}`;
    return true;
  }

  /**
   * THE VERY LAST ONE IS MARKED ONE PROP AT A TIME, AND THE MARK DOES NOT MOVE.
   *
   * Richard: "it should only show the 'next' closest mischief if they ask to
   * 'mark it on my map', but once knocked over, it should wait for the player
   * to 'mark it on my map' again before showing it again." Every other step's
   * mark FOLLOWS the step (the next cane, the next star), which is right for
   * those and was wrong here: the 'last' step's target is the nearest standing
   * prop, so her mark hopped to the next one on every knock and became a
   * second Sense Mischief, the very thing Icewhisker's oath is for. Pinned to
   * the prop, and gone when it goes over.
   */
  _pinLast(p, step = this.step(p)) {
    const pr = p.seekTarget && !p.seekTarget.scored ? p.seekTarget : null;
    if (!pr || !step?.target) return false;
    const s = this._s(p);
    s.mark = null;
    const at = pr.group.position;
    s.override = { x: at.x, z: at.z, y: at.y, t: Infinity, until: () => !!pr.scored, prop: pr, quest: 'last' };
    return true;
  }

  /**
   * MARK IT ON MY MAP, on the Very Last One. The conversation has a memory:
   *
   *   1st ask                   the nearest standing prop, pinned (`_pinLast`)
   *   then, without the buff    "go and see Icewhisker" - and her hall is
   *                             marked until she HAS Sense Mischief
   *   then, with the buff       she loses her temper, once
   *   and again after that      she loses it properly, and sweeps her
   *
   * Richard's note, in order: "After the first time the player asks ... Payne
   * should tell the player that she should go to Icewhisker and get the Sense
   * Mischief ability, from then on, the 'mark it on my map' can show where
   * Icewhisker is and can stay on her until the player has Sense Mischief
   * ability. If they ask ... again ... have Payne get angry in a funny way ...
   * If the player asks her again after that, she can say some more funny
   * stuff and then she can use the 'sweep' ability on the player and send them
   * flying backwards and cancelling the conversation with her (although her
   * voice and complaints should finish even if dialog is ended)."
   *
   * THE BUFF IS `clan.buff.seek`, THE OATH SHE HOLDS NOW, not `clansSworn`:
   * every kitten on this quest has sworn to Icewhisker once (the clans quest
   * comes first), and the arrow belongs to whoever is sworn to her TODAY.
   *
   * @returns the card state to stay on
   */
  askLast(p) {
    const g = this.game;
    const L = this.ledger(p);
    const s = this._s(p);
    const seek = !!p.clan?.buff?.seek;
    const first = !L.lastAsks;
    L.lastAsks += 1;
    if (first) {
      if (this._pinLast(p)) {
        this.say(p, ['payne_h_last'], null, { card: false, now: true });
        g.toast?.(`Payne marked the nearest mischief on ${p.name}'s map`, p.index);
      } else {
        L.lastAsks = 0;       // nothing to mark is not an ask
        g.toast?.('Nothing standing near enough to mark — read the quest card', p.index);
      }
      return 'payneQuests';
    }
    if (!seek) {
      const h = (g.world?.clanHalls ?? []).find((x) => x.clan.id === 'ice');
      if (h) {
        s.mark = null;
        s.override = { x: h.x, z: h.z, t: Infinity, until: (q) => !!q.clan?.buff?.seek, quest: 'last' };
      }
      this.say(p, [L.iceTold ? 'payne_last_ice2' : 'payne_last_ice'], null, { card: false, now: true });
      L.iceTold = true;
      g.toast?.(`Payne marked Icewhisker on ${p.name}'s map`, p.index);
      return 'payneQuests';
    }
    L.mad += 1;
    if (L.mad === 1) {
      this.say(p, ['payne_last_mad1'], null, { card: false, now: true, keep: true });
      g.toast?.("Payne won't mark it — you have Sense Mischief!", p.index);
      return 'payneQuests';
    }
    /* THE SWEEP LANDS ON THE LAST WORD, "SWEEEEP!", which is the end of the
       clip: `after` fires when her clip finishes, not when the card's hold
       does. KEEP: nothing this kitten presses meanwhile (BYE included) can cut
       her off - "her voice and complaints should finish even if dialog is
       ended". */
    this.say(p, [L.mad === 2 ? 'payne_last_mad2' : 'payne_last_mad3'], null, {
      card: false, now: true, keep: true, after: () => this.goblinSweep(p),
    });
    return 'payneQuests';
  }

  /**
   * She sweeps one kitten. NOT COMBAT, and it never asks the gate: no damage,
   * no knockout, no score, nothing knocked over - `Player.blast`, Mr. Satan's
   * gag's own door, with a gag's numbers (non-negotiable 3). Nothing of the
   * town goes over either: the MISCHIEF counter is the kittens', and the Very
   * Last One is a race a goblin must never be able to win for somebody.
   */
  goblinSweep(p) {
    const g = this.game;
    this.spinT = PAYNE_SPIN;
    this.huffT = PAYNE_HUFF;
    this.sweeper.sweepSeq += 1;
    g.sfx?.('sweep');
    /* HER CARD COMES DOWN WHETHER OR NOT THE SWEEP CATCHES HER - the
       conversation is over either way - and with no BYE line: the goodbye is
       the sweep, and what she says next is the complaint. */
    g.inspector?.closePayne?.(p.index);
    const near = this.position && g.players?.includes(p) && !p.ko
      && !p.mount && !p.rideAlong && !p.carried && !p.angel
      && flat(p.position, this.position) <= PAYNE_SHOVE.reach;
    if (near) p.blast?.(this.position, { knock: PAYNE_SHOVE.knock, lift: PAYNE_SHOVE.lift });
    this.say(p, ['payne_last_swept'], null, { card: true, now: true, keep: true });
    return near;
  }

  /** A round of fighting just ended for these kittens. Called at the end of
   *  every round, won or lost — see `TRICK_ROUNDS`. */
  onRound(players) {
    for (const p of players ?? []) if (p) this.ledger(p).rounds += 1;
  }

  /* -------------------------------- voice --------------------------------- */

  /**
   * Queue a message to one kitten.
   *
   * @param p      the kitten it is for — it goes in HER pane
   * @param lines  ids into `PAYNE_LINES`, said in order
   * @param call   'hey', 'oi' or null — how she says the name first
   * @param o.card false when she is talking at her own card (the kitten is
   *               reading it, so a second card in the pane would be clutter)
   * @param o.now  jump the queue and cut off anything of HERS mid-sentence —
   *               the kitten has just pressed a button at her, and an answer
   *               that arrives after an old hint has finished is no answer.
   * @param o.low  a goodbye: said only if nobody else is being talked to, and
   *               cut by anybody's next line. See below.
   * @param o.keep nothing this kitten presses can cut it off (the rant).
   * @param o.after called once, when the last clip has been SAID (or, with no
   *               voice, when the text has had its time) - the sweep's cue.
   */
  say(p, lines, call = 'hey', { card = true, now = false, low = false, keep = false, after = null } = {}) {
    if (!p) return;
    const ids = [];
    /* HER NAME ONLY WHEN THE NAME IS THE ONE SHE RECORDED. A name is typed in
       on the profile screen and can be anything; "Heyyy, Ember!" over a
       kitten who has renamed herself Sparkles is the voice being wrong about
       who she is talking to. The TEXT still uses the real name. */
    const style = styleName(p).toLowerCase();
    const recorded = String(p.name ?? '').toLowerCase() === style;
    const callText = call === 'oi' ? `Oi! ${p.name}!` : call === 'hey' ? `Heyyy, ${p.name}!` : '';
    if (call && recorded && PAYNE_LINES[`payne_${call}_${style}`]) ids.push(`payne_${call}_${style}`);
    const body = lines.filter((id) => PAYNE_LINES[id]);
    ids.push(...body);
    const text = [callText, ...body.map((id) => PAYNE_LINES[id])].filter(Boolean).join(' ');
    const item = { p, ids, text, card, low, keep, after, k: 0, t: 0, el: null, clipT: 0, dur: 0, hadClip: false };
    /* SHE HAS JUST SAID THIS, so it is read, not said - and not queued, so a
       sister's answer that is a repeat never holds up one that is not. Only
       an answer at her own card (`card: false`) and never one with a cue:
       the sweep lands on the rant's last word, which has to be heard. */
    const repeat = !card && !after && ids.length > 0 && ids.every((id) => this._saidRecently(id));
    if (now) {
      /* ONE KITTEN'S PRESS NEVER CUTS ANOTHER KITTEN OFF. Reported: "If Payne
         is talking to another player, and someone closes dialog box with
         Payne, it cancels the speech for the other player. It shouldn't do
         that and the other players dialog that appears should take preference
         over Payne's exit voice." `now` used to end whatever was current,
         whoever it was for, so a sister's BYE ate the answer her sister had
         just asked for. Now `now` cuts only this kitten's own words (and not
         a `keep` rant), and waits at the head of the queue otherwise.
         A GOODBYE IS THE LEAST OF WHAT SHE SAYS: it is dropped outright when
         somebody else is being talked to or waiting, and anybody's next line
         cuts one that is playing. "Go make some mischief!" after the kitten
         has walked off is not worth a sister's answer waiting for it. */
      const cur = this.current;
      const others = (cur && cur.p !== p && !cur.low) || this.queue.some((q) => q.p !== p && !q.low);
      if (low && (others || cur?.keep)) return null;
      this.queue = this.queue.filter((q) => (q.p !== p || q.card || q.keep) && !q.low);
      if (cur && (cur.low || (cur.p === p && !cur.keep))) this._end(true);
      if (repeat) { this._captionFor(item); return item; }
      this.queue.unshift(item);
    } else {
      /* ONE WAITING MESSAGE PER KITTEN. Two hints queued for the same girl
         are the same advice twice; the newer one is the truer one. */
      this.queue = this.queue.filter((q) => q.p !== p);
      this.queue.push(item);
    }
    return item;
  }

  /** What she is saying to this kitten right now, for her own card - or the
   *  words of a repeat she is showing her rather than saying again. */
  speaking(p) {
    if (this.current?.p === p) return this.current.text;
    const c = this.caption.get(p);
    return c && this.t < c.until ? c.text : null;
  }

  /** Has she started saying this clip in the last `SAID_RECENTLY` seconds? */
  _saidRecently(id) {
    if (isNameClip(id)) return false;
    const at = this.said.get(id);
    return at != null && this.t - at < SAID_RECENTLY;
  }

  /** Show a message's words on her card for as long as they take to read. */
  _captionFor(c) {
    this.caption.set(c.p, { text: c.text, until: this.t + SILENT_BASE + c.text.length * SILENT_PER_CHAR });
  }

  /**
   * This kitten has stopped talking to her - BYE, START, the sweep, a card
   * taken down for the trade window. Richard: "Payne is queuing up menu
   * selection voices even though the player already exited the menu, we
   * should not queue up voice like that. We can queue up voice between
   * multiple people talking to her, but if the player stops talking to her,
   * should cancel that queue for the player that left."
   *
   * HOW IT HAPPENED: a press at her card waits behind a sister's answer
   * (`now` never cuts another kitten off), and BYE is dropped outright while
   * somebody else is being talked to - BEFORE it got as far as clearing her
   * own waiting answers. So the answer she had already walked away from was
   * said, to nobody, after her sister's.
   *
   * WHAT SURVIVES: a goodbye (`low`, cut by anybody anyway), a rant (`keep`:
   * "her voice and complaints should finish even if dialog is ended"), and a
   * hint for her pane (`card`), which is about the world and not this menu.
   */
  leave(p) {
    if (!p) return;
    this.queue = this.queue.filter((q) => q.p !== p || q.card || q.keep || q.low);
    const cur = this.current;
    if (cur && cur.p === p && !cur.card && !cur.keep && !cur.low) this._end(true);
    this.caption.delete(p);
  }

  _voice(dt, quiet) {
    const g = this.game;
    if (this.current) {
      const c = this.current;
      /* THE KITTEN LEFT, OR A SCENE TOOK THE SCREEN: stop, and do not come
         back to it later — a hint about the bamboo after the ending is news
         from a different afternoon. */
      if (!(g.players ?? []).includes(c.p) || (quiet && c.card)) { this._end(true); return; }
      c.t += dt;
      c.clipT += dt;
      const el = c.el;
      /* SOMEBODY ELSE STARTED TALKING. `Audio.speak` is one speaker; if Mr.
         Satan has just taken it, her clip was stopped and she is done. */
      const cut = el && g.audio?._speaking && g.audio._speaking !== el;
      const clipDone = !el || el.ended || cut || c.clipT > (c.clipDur ?? 0) + 4;
      if (clipDone) {
        if (!cut && c.k < c.ids.length) { this._play(c); return; }
        /* ITS CUE, ONCE: on the last word when there was a voice, and after
           the text's own time when there was not - a sweep that fired the
           instant a silent card appeared would land before it was read. */
        if (c.after && (c.hadClip || c.t >= c.dur - HOLD_TAIL)) {
          const f = c.after;
          c.after = null;
          c.keep = false;
          f();
          return;
        }
        if (c.t >= c.dur) this._end(false);
      }
      return;
    }
    if (!this.queue.length) return;
    /* HE GOES FIRST. See the header. */
    if (g.announcer?.active || g.announcer?.queue?.length) return;
    if (quiet && this.queue[0].card) return;
    const c = this.queue.shift();
    if (!(g.players ?? []).includes(c.p)) return;
    /* A REPEAT BY THE TIME IT CAME UP - she said it to a sister while this
       one waited. Her name stays (it is never a repeat); the rest is read. An
       answer with nothing left to say is shown on her card and lets the next
       one start, rather than holding the queue for its reading time. */
    if (!c.after) c.ids = c.ids.filter((id) => !this._saidRecently(id));
    if (!c.ids.length && !c.card && !c.after) { this._captionFor(c); return; }
    this.caption.delete(c.p);
    this.current = c;
    /* How long the card holds: every clip she has, back to back, plus the
       tail — or the text's own length when there are no clips at all. */
    const clips = c.ids.map((id) => g.announcer?.clip?.(id)).filter(Boolean);
    const spoken = clips.reduce((a, x) => a + x.dur, 0);
    c.dur = clips.length ? spoken + HOLD_TAIL
      : SILENT_BASE + c.text.length * SILENT_PER_CHAR;
    c.dur = Math.max(c.dur, SILENT_BASE);
    this._paintHint(c);
    this._play(c);
  }

  _play(c) {
    const g = this.game;
    while (c.k < c.ids.length) {
      /* THE INDEX MOVES ON ITS OWN LINE. `a?.clip?.(ids[k++])` short-circuits
         the ARGUMENTS too when there is no announcer, so `k` never moved and
         this loop never ended: found by world-check the first time anything
         ran her voice with no clips loaded, which is exactly the fallback
         non-negotiable 9 promises. */
      const id = c.ids[c.k++];
      const clip = g.announcer?.clip?.(id);
      if (!clip) continue;
      c.el = g.audio?.speak?.(clip.el) ?? null;
      this.said.set(id, this.t);
      c.hadClip = true;
      c.clipT = 0;
      c.clipDur = clip.dur;
      return;
    }
    c.el = null;
  }

  _end(stop) {
    const c = this.current;
    if (!c) return;
    if (stop && c.el && this.game.audio?._speaking === c.el) this.game.audio.stopSpeaking();
    this.current = null;
    this._clearHint();
  }

  /** Everything down, silently. Restart, quit, a load. */
  clear() {
    this.queue.length = 0;
    this._end(true);
    this.said.clear();
    this.caption.clear();
  }

  /** A restart: nobody has met her. */
  reset() {
    this.clear();
    this.st = new WeakMap();
    for (const p of this.game.players ?? []) if (p) p.payne = blankPayne();
  }

  /* ------------------------------- the card ------------------------------- */

  /** Draw her face into a canvas: the helmet all afternoon, her own face from
   *  the Awakening on. See `PAYNE_ART`. */
  drawFace(cv, revealed = this.revealed) {
    const key = revealed ? 'held' : 'town';
    const img = this.img?.[key];
    const g2 = cv?.getContext?.('2d');
    if (!g2) return;
    g2.clearRect(0, 0, cv.width, cv.height);
    if (!img) return;
    const [x, y, s] = PAYNE_ART[key].face;
    g2.drawImage(img, x, y, s, s, 0, 0, cv.width, cv.height);
  }

  _paintHint(c) {
    if (!this.host || !c.card) return;
    const i = c.p.index ?? 0;
    let el = this.cardEls[i];
    if (!el) {
      el = document.createElement('div');
      el.className = 'payne-hint';
      el.innerHTML = '<canvas class="ph-face" width="128" height="128"></canvas>'
        + '<div class="ph-body"><div class="ph-name"></div><div class="ph-text"></div></div>';
      this.host.appendChild(el);
      this.cardEls[i] = el;
    }
    el.querySelector('.ph-name').textContent = `${PAYNE_WHO.name}  ·  to ${c.p.name}`;
    el.querySelector('.ph-text').textContent = c.text;
    el.style.setProperty('--me', cssFor(c.p.style));
    this.drawFace(el.querySelector('.ph-face'));
    el.classList.remove('hidden', 'out');
    el.classList.add('in');
    el.dataset.side = String(i);
    this.host.classList.remove('hidden');
    this.layout();
  }

  _clearHint() {
    for (const el of this.cardEls) if (el) { el.classList.add('hidden'); el.classList.remove('in'); }
    this.host?.classList.add('hidden');
    if (typeof document !== 'undefined') document.body?.style?.removeProperty?.('--payne-h');
  }

  /**
   * Put the live card over its kitten's pane, on top of the warning strip.
   * Called whenever a card goes up and at the minimaps' 20Hz — the same
   * throttle, and the same reason, as `Game._placeWarnings`.
   */
  layout() {
    const g = this.game;
    const c = this.current;
    if (!this.host || !c?.card) return;
    const i = c.p.index ?? 0;
    const el = this.cardEls[i];
    if (!el) return;
    /* A PHONE IS ONE PANE, AND ITS WARNINGS ARE AT THE TOP. The stylesheet
       puts her card there and this measures it, so the warning strip can be
       pushed down by exactly her height — "above ... any other warning
       message", on the one screen where "above" is the top of the glass. */
    if (document.body.classList.contains('touch-ui')) {
      el.style.cssText = '';
      el.style.setProperty('--me', cssFor(c.p.style));
      const h = el.getBoundingClientRect?.().height ?? 0;
      document.body.style.setProperty('--payne-h', `${Math.ceil(h) + 6}px`);
      return;
    }
    const W = window.innerWidth;
    const H = window.innerHeight;
    const groups = g.groups?.length ? g.groups : [(g.players ?? []).map((_, k) => k)];
    const panes = g._warnWide ? [{ x: 0, y: 0, w: W, h: H }] : g._panes?.(W, H, groups) ?? [];
    const gi = g._warnWide ? 0 : groups.findIndex((m) => m.includes(i));
    const v = panes[gi] ?? { x: 0, y: 0, w: W, h: H };
    const w = payneWidth(v.w);
    const spot = payneSpot({ v, H, w });
    el.style.left = `${spot.left}px`;
    el.style.top = `${spot.bottom}px`;
    el.style.width = `${w}px`;
    el.style.maxHeight = `${spot.maxH}px`;
  }

  /* ------------------------------ the beacons ----------------------------- */

  /**
   * A pillar of green light over wherever she has marked — the world half of
   * "she will highlight where the player needs to go next". The minimap
   * answers which island; this answers which spot once she is there, the same
   * split `lasthunt` and Icewhisker's chevron make.
   *
   * ONE PER KITTEN, in the kitten's colour at the top so two sisters with two
   * marks can tell whose is whose. Everybody sees every pillar — the scene is
   * shared — which is fine: a sister pointing at the ash island is a thing her
   * sister can help with.
   */
  _beacons(dt) {
    const g = this.game;
    if (!g.scene) return;
    const live = new Set();
    for (const p of g.players ?? []) {
      if (!p) continue;
      live.add(p);
      let b = this.beacons.get(p);
      const goal = this.goalFor(p);
      if (!goal) { if (b) b.visible = false; continue; }
      if (!b) {
        b = new THREE.Group();
        const beam = new THREE.Mesh(
          new THREE.CylinderGeometry(0.55, 0.9, 40, 12, 1, true),
          new THREE.MeshBasicMaterial({
            color: 0x7fd35a, transparent: true, opacity: 0.28, depthWrite: false,
            side: THREE.DoubleSide, toneMapped: false, blending: THREE.AdditiveBlending,
          }));
        beam.position.y = 20;
        const cone = new THREE.ConeGeometry(0.95, 2, 5);
        cone.rotateX(Math.PI);
        const tip = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({
          color: p.style?.colour ?? 0xffffff, transparent: true, opacity: 0.95,
          depthWrite: false, toneMapped: false,
        }));
        tip.name = 'tip';
        b.add(beam, tip);
        g.scene.add(b);
        this.beacons.set(p, b);
      }
      b.visible = true;
      const y = goal.y ?? g.world?.heightAt?.(goal.x, goal.z)?.y ?? 0;
      b.position.set(goal.x, y, goal.z);
      const tip = b.getObjectByName('tip');
      if (tip) {
        tip.position.y = 6 + Math.sin(this.t * 3) * 0.4;
        tip.rotation.y += dt * 2.2;
      }
    }
    for (const [p, b] of this.beacons) {
      if (!live.has(p)) { g.scene.remove(b); this.beacons.delete(p); }
    }
  }

  /* --------------------------- the talking card --------------------------- */

  /**
   * The rows on her card, top to bottom. Index into this is the Inspector's
   * cursor, so the order is the order on screen.
   *
   * EVERY ROW SAYS WHAT IT DOES (sixth non-negotiable), and the locked one
   * says what it WANTS, as an instruction.
   */
  rows(p) {
    const g = this.game;
    const L = this.ledger(p);
    const ready = trickReady(g, p);
    const need = [];
    const left = CHAIN.length - settledCount(g, p);
    if (left > 0) need.push(`finish my quests (${CHAIN.length - left} of ${CHAIN.length})`);
    if (L.rounds < TRICK_ROUNDS) need.push(`fight ${TRICK_ROUNDS} rounds in the arena (${L.rounds} of ${TRICK_ROUNDS})`);
    /* NO HINTS ROW ONCE HER LIST IS SETTLED. Asked: "When talking to Payne,
       after the Ending Cutscene, does having hint on/off do anything? If not,
       we should turn hints off and disable this option or remove it from
       Payne's menu." It did nothing: every hint and tease is a step of
       `nextStep`, and after the Awakening every quest is closed, so the
       watcher returned before the switch was ever read. Removed rather than
       greyed — a row that does nothing reads as broken (sixth non-negotiable),
       and there is no instruction a locked row could give her. The card is
       closed during the ending, so no row slides out from under a cursor. */
    const hintsRow = currentQuest(g, p) ? [{
      key: 'hints', title: L.hints ? 'HINTS: ON — TURN THEM OFF' : 'HINTS: OFF — TURN THEM ON',
      blurb: L.hints
        ? "She'll find you when you're stuck for two minutes, and mark the way on your map."
        : "Turn on, and she'll find you if you're stuck for two minutes and mark the way on your map.",
    }] : [];
    return [
      { key: 'quests', title: "WHAT'S MY NEXT QUEST?", blurb: 'Your quest list, and where to go next.' },
      ...hintsRow,
      {
        key: 'profile', title: 'CHARACTER PROFILE',
        blurb: 'Your quests and orbs, and trading. Everybody stops and gets their own cursor.',
      },
      {
        key: 'trick', title: L.sweep ? 'THE GOBLIN SWEEP — SHOW ME AGAIN'
          : ready ? 'LEARN A SECRET GOBLIN TRICK!' : 'SECRET GOBLIN TRICK — LOCKED',
        blurb: L.sweep ? 'How to do it.' : ready ? 'She will teach you the Goblin Sweep.'
          : `To learn it: ${need.join(', and ')}.`,
        locked: !L.sweep && !ready,
      },
    ];
  }

  /** She has just been opened by this kitten: say hello. */
  greet(p) {
    const L = this.ledger(p);
    const first = !L.met;
    L.met = true;
    this.say(p, [first ? 'payne_hello' : 'payne_back'], 'hey', { card: false, now: true });
  }

  /**
   * A row was chosen. Returns the card state to go to, or null to close.
   * `profile` is handled by the Inspector, which owns the hand-over.
   */
  choose(p, key) {
    const g = this.game;
    const L = this.ledger(p);
    switch (key) {
      case 'quests': {
        const q = currentQuest(g, p);
        const all = CHAIN.every((id) => questState(g, p, id) === 'done');
        const line = q ? `payne_q_${q}` : all ? 'payne_q_done' : 'payne_q_closed';
        this.say(p, [line], null, { card: false, now: true });
        return 'payneQuests';
      }
      case 'mark': {
        this._s(p).step = null;
        if (this.step(p)?.quest === 'last') return this.askLast(p);
        const ok = this.markNow(p);
        if (ok) {
          const step = this.step(p);
          this.say(p, [step.line], null, { card: false, now: true });
          g.toast?.(`Payne marked it on ${p.name}'s map`, p.index);
        } else {
          /* A REFUSAL SAYS SO. Nothing to mark is either "all done" or a step
             with no place (no bamboo left in the world). */
          g.toast?.(currentQuest(g, p) ? 'Nothing to mark for this one — read the quest card'
            : 'All my quests are done — nothing left to mark!', p.index);
        }
        return 'payneQuests';
      }
      case 'hints': {
        L.hints = !L.hints;
        this.say(p, [L.hints ? 'payne_hints_on' : 'payne_hints_off'], null, { card: false, now: true });
        const s = this._s(p);
        s.sig = '';
        if (L.hints) this.markNow(p);
        else { s.mark = null; s.override = null; }
        return 'payne';
      }
      case 'trick': {
        if (L.sweep) return 'payneTrick';
        if (!trickReady(g, p)) {
          /* LOCKED, AND IT SAYS WHAT IT WANTS. The row's own blurb already
             reads as the instruction; the toast is the press being answered,
             so a press on a locked row is never silence. */
          const r = this.rows(p).find((x) => x.key === 'trick');
          g.toast?.(`Not yet! ${r.blurb}`, p.index);
          this.say(p, ['payne_trick_tease'], null, { card: false, now: true });
          return 'payne';
        }
        L.sweep = true;
        g.sfx?.('quest');
        this.say(p, ['payne_trick_teach'], null, { card: false, now: true });
        return 'payneTrick';
      }
      case 'bye':
      default:
        this.say(p, ['payne_bye'], null, { card: false, now: true, low: true });
        return null;
    }
  }

  /** The talking card's markup. `state` is the Inspector's card state. */
  markup(index, state, cursor, backButton) {
    const g = this.game;
    const p = g.players[index];
    if (!p) return '';
    const face = '<canvas class="pn-face" width="160" height="160"></canvas>';
    const talk = this.speaking(p);
    const said = talk ? `<div class="pn-said">“${esc(talk)}”</div>` : '';
    const head = `<div class="pc-head pn-head">${face}<div><span class="pn-name">PAYNE</span>
      <span class="pc-dim">the goblin · talking to <span class="pc-who">${esc(p.name)}</span></span>
      ${said}</div></div>`;

    if (state === 'payneQuests') {
      const rows = questList(g, p);
      const now = currentQuest(g, p);
      const step = this.step(p);
      const mark = { done: '✔', taken: '—', closed: '✖', lead: '★', open: '·' };
      const li = (r) => {
        const cls = r.state === 'done' ? 'done' : r.id === now ? 'now' : r.state;
        const note = r.tag ? (r.note ? ` <span class="pc-dim">${esc(r.note)}</span>` : '')
          : r.state === 'taken' ? ' <span class="pc-dim">somebody got there first</span>'
            : r.state === 'closed' ? ' <span class="pc-dim">the door is shut</span>' : '';
        return `<li class="pn-q ${cls}"><i>${r.id === now ? '▶' : mark[r.state] ?? '·'}</i>`
          + `${r.icon} <b>${esc(r.title)}</b>${note}</li>`;
      };
      const chain = rows.filter((r) => !r.tag).map(li).join('');
      const tags = rows.filter((r) => r.tag).map(li).join('');
      const next = step ? `<div class="pn-next"><b>NEXT:</b> ${esc(step.where)}</div>`
        : '<div class="pn-next"><b>ALL DONE.</b> Every one of my quests is settled.</div>';
      const acts = ['MARK IT ON MY MAP', '◀ BACK'].map((t, k) => `
        <div class="pc-row pn-act${k === cursor ? ' cursor' : ''}" data-side="${index}" data-row="${k}"><b>${t}</b></div>`)
        .join('');
      return `<div class="pc-inner pn-card">${head}
        ${next}
        <ol class="pn-list">${chain}</ol>
        <div class="pn-tag">TAG-ALONGS — whoever leads at the end</div>
        <ol class="pn-list">${tags}</ol>
        <div class="pn-acts">${acts}</div>
        <div class="pc-foot">${backButton(index, 'BACK')}<span>JUMP <b>choose</b> · INTERACT <b>back</b></span></div>
      </div>`;
    }

    if (state === 'payneTrick') {
      return `<div class="pc-inner pn-card">${head}
        <div class="pn-trick"><img src="${PAYNE_ART.sweep.src}" alt="">
          <div><b class="pn-trick-name">THE GOBLIN SWEEP</b>
          <p>Hold <b>RUN</b>, stand <b>still</b>, and press <b>ATTACK</b>.</p>
          <p class="pc-dim">A spin that knocks over everything around you — every barrel and lantern in a circle.
          In the arena it hits everybody round you too, and then needs a few seconds to catch its breath.</p></div>
        </div>
        <div class="pc-foot">${backButton(index, 'BACK')}<span>INTERACT <b>back</b></span></div>
      </div>`;
    }

    const rows = this.rows(p).map((r, k) => `
      <div class="pc-row${k === cursor ? ' cursor' : ''}${r.locked ? ' locked' : ''}" data-side="${index}" data-row="${k}">
        <b>${r.title}</b>
        <div class="pc-dim">${esc(r.blurb)}</div>
      </div>`).join('');
    return `<div class="pc-inner pn-card">${head}
      ${rows}
      <div class="pc-foot">${backButton(index, 'BYE, PAYNE')}<span>JUMP <b>choose</b> · INTERACT <b>bye</b></span></div>
    </div>`;
  }

  /** How many rows the cursor ranges over in this state. */
  rowCount(p, state) {
    if (state === 'payneQuests') return 2;
    if (state === 'payneTrick') return 0;
    return this.rows(p).length;
  }

  /** Map a quests-view row to an action key. */
  questAct(row) { return row === 0 ? 'mark' : 'back'; }
}
