import { SATAN_RADIUS } from '../entities/satan.js';

/* ---------------------------------------------------------------------------
   How the tournament opens.

   A ladder with five rungs, all of them driven by things the girls were going
   to do anyway:

     1  all seven stars found, AND Ryuuseki ridden at least once
     2  ...then thirty seconds later, Mr Satan announces the tournament
     3  pop-in calls at 50 / 60 / 70 / 75% mischief
     4  at 80%, the arena appears in the sky and he opens it
     5  both kittens stand with him in the town and say yes

   WHY IT IS GATED ON RIDING RYUUSEKI AND NOT JUST ON FINDING HIM. Collecting
   the seventh star is an achievement with its own scene and its own dragon;
   cutting from that straight into an advertisement for a different feature
   spends the payoff of the thing the whole game has been building toward. The
   thirty seconds exist for the same reason — long enough for the flight to
   have actually happened.

   WHY THE MISCHIEF LADDER AT ALL. The arena could simply have opened with the
   dragon. But the mischief counter is the number the girls have been watching
   all afternoon, and the one thing it has never done is *lead anywhere* —
   100% got an ending and nothing in between got anything. Five voice lines
   turn the back half of that bar into a countdown. It is the cheapest
   possible feature and it changes what the number means.

   MILESTONES ALREADY PASSED ARE SPENT SILENTLY. A pair who reach the dragon
   at 78% would otherwise get four announcements inside four seconds, which is
   a queue of Mr Satan shouting percentages nobody is at any more.
--------------------------------------------------------------------------- */

/** Seconds after Ryuuseki is first ridden before he butts in. */
export const ANNOUNCE_DELAY = 30;

/** The fraction of total mischief that opens the arena. */
export const OPEN_AT = 0.80;

/** The pop-in calls on the way there, and what he says at each. */
export const MILESTONES = [
  { at: 0.50, id: 'sat_p50', text: 'Halfway there, kittens! Keep smashing! The ring is only half built, and so are you!' },
  { at: 0.60, id: 'sat_p60', text: 'Sixty percent! My workers are laying the tiles as we speak! Do not slow down now!' },
  { at: 0.70, id: 'sat_p70', text: 'Seventy! Ooh, I am getting excited. I might even fight you myself. I said MIGHT.' },
  { at: 0.75, id: 'sat_p75', text: 'Seventy-five percent! The banners are up! The snacks are ordered! Hurry up, hurry up!' },
];

/** Where he stands in the town, on the main street north of the plaza. */
export const SATAN_TOWN = { x: 11, z: 22 };

export class ArenaQuest {
  constructor({ game, world, satan, announcer }) {
    this.game = game;
    this.world = world;
    this.satan = satan;
    this.announcer = announcer;

    /** waiting | pending | calling | open | boarding | away */
    this.stage = 'waiting';
    this.timer = 0;
    this.spent = new Set();
    /** Set once either kitten has actually been aboard Ryuuseki. */
    this.rodeRyu = false;
    /** Both kittens standing with him, for the accept prompt. */
    this.bothHere = false;
  }

  /** Everything back in its box — used by restart. */
  reset() {
    this.stage = 'waiting';
    this.timer = 0;
    this.spent.clear();
    this.rodeRyu = false;
    this.bothHere = false;
    this.world.openArena(false);
    this.satan?.moveTo(this.satan.homeAt.x, this.satan.homeAt.y, this.satan.homeAt.z);
    this.satan?.setLine('');
    if (this.satan) this.satan.group.visible = false;
  }

  /** The fraction of the world knocked over, 0..1. */
  get mischief() {
    const total = this.world.mischiefTotal || 1;
    return this.world.props.filter((p) => p.scored).length / total;
  }

  /** True once the arena is open and they can be taken there. */
  get canEnter() {
    return this.stage === 'open';
  }

  /**
   * @param {number} dt
   * @param {Player[]} players
   * @param {Array} pads  the per-player input snapshots, index-matched to
   *        `players`. Passed in rather than read off the player, because
   *        "did she press interact" is a fact about the frame's input and the
   *        player object has deliberately never carried one.
   * @param {Game} hud
   */
  update(dt, players, pads, hud) {
    const S = this.satan;

    switch (this.stage) {
      case 'waiting':
        /* BOTH halves of the gate. `ballsHeld` alone is not enough — the
           whole point of waiting is that the dragon has been ridden. */
        if (hud.ballsHeld >= 7 && this.rodeRyu) {
          this.stage = 'pending';
          this.timer = 0;
        }
        break;

      case 'pending':
        this.timer += dt;
        if (this.timer < ANNOUNCE_DELAY) break;
        /* NOT WHILE ANYTHING ELSE OWNS THE SCREEN. `SummonScene.start`
           refuses when a scene is running, and a refusal here would lose the
           announcement outright — nothing would ever ask again — so the stage
           only advances once the scene has actually been accepted. */
        if (hud._sceneActive()) break;
        /* IT USED TO ALSO WAIT FOR EVERY KITTEN TO GET OFF THE DRAGON, and
           that is the bug this comment replaces. The gate read
           `players.some((p) => p.mount || p.rideAlong)` and the reasoning was
           "do not take the screen off somebody thirty units up" — which sounds
           right and is wrong for one reason nobody spotted: THE THING THAT
           OPENS THIS STAGE IS RIDING RYUUSEKI. A pair who climb on and stay on
           — which is exactly what a pair who have just summoned a dragon do —
           hold the gate shut for as long as they are enjoying him, and Richard
           reported it as the announcement only arriving once everybody had
           jumped off. A countdown that only finishes when you stop playing
           with the thing that started it is not a delay, it is a hang.
           A MOUNTED KITTEN IS SAFE THROUGH A SCENE, and that is what makes
           taking the gate out cost nothing. `Player.update` is not called while
           a scene owns the screen, and a ridden dragon has no will of its own —
           `Dragon.update` sets `state = 'ridden'` and returns, so the flight is
           frozen where she left it and resumes underneath her when the scene
           ends. Nothing falls, nothing drifts, nobody is dismounted. */
        if (hud.summonScene.start('satanAnnounce', hud.townCentre(), 74, S?.art)) {
          this.stage = 'calling';
          // Everything already passed is spent, silently. See the header.
          const m = this.mischief;
          for (const ms of MILESTONES) if (m >= ms.at) this.spent.add(ms.id);
          if (S) {
            S.group.visible = true;
            S.setLine('Knock this town FLAT and the arena is yours!\nI am Mr. Satan. You have heard of me.');
          }
        }
        break;

      case 'calling': {
        const m = this.mischief;
        for (const ms of MILESTONES) {
          if (m < ms.at || this.spent.has(ms.id)) continue;
          this.spent.add(ms.id);
          this.announcer?.say(ms.id, ms.text);
        }
        if (m >= OPEN_AT && !hud._sceneActive()) {
          /* THE ISLAND APPEARS BEFORE THE SCENE, not after it. The shot
             circles the arena, and a camera flown to empty sky over a hidden
             island is a thirty-second scene about nothing. */
          this.world.openArena(true);
          if (hud.summonScene.start('satanOpen', this.world.arenaCentre, 96, S?.art)) {
            this.stage = 'open';
            hud.toast('THE ARENA IS OPEN — find Mr. Satan in the town!', 0);
            /* ONE TOAST PER PLAYER, so the second line is addressed to a kitten
               who exists. Solo it would have been a toast styled `p1` telling
               the only player to gather "both of you" — an instruction naming a
               sister who is not in the game, which reads as her having missed
               something rather than as the party being small. She still gets the
               line above, and Mr. Satan tells her the rest at the door. */
            if (players.length > 1) {
              hud.toast('THE ARENA IS OPEN — both of you, together!', 1);
            }
          } else {
            // The scene was refused; the island is open either way. Try the
            // scene again next frame rather than losing the stage change.
            this.world.openArena(false);
          }
        }
        break;
      }

      case 'open': {
        if (!S) break;

        /* A PARTY OF ONE CANNOT FIGHT A TOURNAMENT, AND HE SAYS SO AS AN
           INSTRUCTION. Every league in `MODES` wants two fighters or more, so
           `modesFor(1)` is empty — and `begin()` falls through to
           `available[0] ?? MODES[0]`, which is a DUEL with one fighter, one
           side, and a `wins` array of length 1. That is a round that cannot be
           lost, which is worse than a round that cannot be started: a kid wins
           the World Martial Arts Tournament by walking into the ring alone and
           the whole thing stops meaning anything.

           So the door is shut here, at the door, rather than by teaching the
           leagues to cope with one fighter. Shutting it in `begin` would refuse
           her AFTER the griffin had flown her north, which is a journey ending
           in nothing.

           IT NAMES WHAT TO DO, not what is missing — "bring a sister" rather
           than "two players required". `near` is not even computed: there is no
           arrangement of one kitten that opens this. */
        if (players.length < 2) {
          S.setLine('The ring is ready — but a tournament needs TWO fighters!'
            + '\nBring a sister. Hand her a controller and press START.');
          this.bothHere = false;
          break;
        }

        /* BOTH OF THEM, AND THAT IS THE POINT. The tournament is the one
           thing in this game that cannot be done alone, so the door to it
           asks for both — and it says so out loud when only one is standing
           there, because a prompt that simply does not appear is
           indistinguishable from a broken one. */
        const near = players.map(
          (p) => !p.mount && !p.rideAlong
            && Math.hypot(p.position.x - S.position.x, p.position.z - S.position.z) < SATAN_RADIUS
        );
        /* EVERYONE, not both — `every` already said that, but the words did
           not. With four kittens playing, "fetch your sister" names one of
           three and reads as the game not knowing who is here. */
        this.bothHere = near.every(Boolean);
        const many = players.length > 2;
        S.setLine(this.bothHere
          ? `${many ? 'ALL of you' : 'BOTH of you'}! Excellent!`
            + '\nPress INTERACT and my griffin will take you.'
          : `The ring is ready!\nI need ${many ? 'EVERYONE' : 'BOTH of you'} here.`);

        // Either of them may say yes once both are standing there.
        if (this.bothHere && pads.some((pad, i) => near[i] && pad.pressed('interact'))) {
          this.stage = 'boarding';
          this.announcer?.say('sat_board',
            'Excellent! Climb on, kittens! The World Martial Arts Tournament awaits!');
          hud.enterArena();
        }
        break;
      }

      default:
        break;
    }

    /* He is only in the world once he has announced himself. Before that the
       town has a champion standing in it advertising a tournament nobody has
       mentioned, which is the sort of loose end a kid asks about and the game
       cannot answer. */
    if (S && S.group.visible) S.update(dt, players);
  }

  /** Called when the girls come home, so the door is open again. */
  onReturn() {
    this.stage = 'open';
    this.bothHere = false;
  }
}
