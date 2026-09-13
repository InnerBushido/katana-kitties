/* ---------------------------------------------------------------------------
   THE LAST FIVE.

   A 100% run ends with a hunt. Two hundred and sixteen props go down in an
   afternoon of happy destruction and then the counter reads 213 / 216 and
   nobody can find the other three, because the other three are a lantern
   behind a hall on the ash island, a crate under the dojo steps, and one cane
   at the back of a grove. The game has always had an answer to that —
   Icewhisker's Sense Mischief — and the answer was invisible: it is a clan
   buff, on a shrine, on an island a flight away, and nothing ever said so at
   the moment it would have helped.

   So the elder counts them down.

     > Make it that if there are less than 5 Mischief in the world, then a
     > countdown begins by the Elder (similar to the countdown that Mr. Satan
     > does) announcing how many are left for the last 5. Whenever one is found,
     > then it says how many more are left and excitement builds up. If they
     > aren't able to find the next one for more than 1 minute, then the Elder
     > should chime in and remind them to unlock the Sense Mischief ability with
     > Ice Whisker at the Ice floating island, if they don't already have it
     > enabled. Once there are 3 or less mischief left, then let's highlight on
     > the mini-map where the next/closest "Sense Mischief" item is.

   THREE THINGS, AND THEY ARE DELIBERATELY SEPARATE. The count is a voice, the
   reminder is a hint, and the map mark is help. They escalate: she names the
   number every time one goes down, she suggests the clan only once the hunt has
   actually stalled, and the map only starts pointing when it is nearly over.
   A hint that fires immediately is a walkthrough; a hint that never fires is a
   nine-year-old wandering an island for twenty minutes. Both have happened.

   IT NEVER TOUCHES THE COUNTER AND IT NEVER MOVES A PROP. This file reads a
   number and says a sentence. `Game.onMischief` remains the only thing that
   knows what has been scored, which is what keeps the fourth non-negotiable
   ("nothing regrows and nothing is lost") true: a countdown that could be
   wrong about how many are left would be worse than no countdown, and the only
   way to guarantee it cannot be is to give it nothing of its own to be wrong
   with.

   SHE BORROWS MR SATAN'S CARD. See `systems/announce.js`: one `#announce`, one
   queue, a speaker per line. The two of them really can collide — the barrel
   that takes the count to four is quite capable of being the one that crosses
   80% and opens the tournament — and a queue means they take turns instead of
   talking over each other in the same corner of the screen.
--------------------------------------------------------------------------- */

/** How many still standing when she starts counting. */
export const HUNT_FROM = 5;

/**
 * ...and when the map starts helping.
 *
 * LATER THAN THE VOICE ON PURPOSE. Between five and four the hunt is still a
 * hunt and being told where to go would take the last discovery in the game
 * away from them. At three it has usually stopped being fun, which is the same
 * line `world.CLANS` draws for Icewhisker's buff in the first place: "hunting
 * the last three unbroken barrels across six islands is the part of a 100% run
 * that stops being a game and starts being a chore".
 */
export const MAP_FROM = 3;

/** Seconds of no progress before she mentions Icewhisker, and between repeats.
 *  A minute was what was asked for; the repeat is longer because the second
 *  time somebody is told something is where a hint turns into nagging. */
export const STUCK_FIRST = 60;
export const STUCK_AGAIN = 90;

/** ...and how many times, ever. Three and she stops: if the hint has not landed
 *  by the third telling it is not going to, and a voice that never gives up is
 *  a voice a kid learns to tune out. */
export const STUCK_MAX = 3;

/**
 * What she says, and the file that says it.
 *
 * ONE ENTRY PER NUMBER, NOT ONE SENTENCE WITH A NUMBER IN IT. A template would
 * be one recording short of useless — the whole point is that the delivery
 * builds, and "two" said in the same breath as "five" is a counter, not an
 * elder. Five lines, and they get shorter and closer to the ear as the number
 * comes down, which is how excitement is written rather than acted.
 *
 * THE TEXT IS THE LINE AND THE CLIP IS THE DRESSING. Ninth non-negotiable:
 * delete `public/voice/` and every one of these still appears on the card and
 * still holds for its own length. That is why the text lives here, beside the
 * id, rather than inside the audio.
 *
 * AND THE WRITING IS THE DIRECTION. `text2speech_v2` with a preset takes the
 * text and the voice id and NOTHING ELSE — no style field, no temperature (see
 * docs/notes/voices.md). So a line written flat comes back flat, and the
 * punctuation is the only timing control there is: a full stop is a beat and
 * an em dash is a shorter one.
 *
 * WHICH IS WHY THESE BREAK HER OWN RULE ON PURPOSE. That file says Patchfur is
 * *"written in long, unhurried sentences — the only voice allowed to take its
 * time; every other character is on a clock"*, and it is right about every
 * other line she has. Here she is on a clock, and it is the girls' clock: the
 * sentences shorten as the number comes down, because "excitement builds up"
 * written for a voice with no direction field IS the sentence length. The
 * elder who takes her time is still in `hunt5`; by `hunt1` she has stopped.
 */
export const HUNT_LINES = {
  hunt5: 'Five. Out of everything in this whole sky, five things are still standing.',
  hunt4: 'Four now. Four little things left upright in the world.',
  hunt3: 'Three! Oh, I can count them on one paw — three!',
  hunt2: 'Two. Two, and then one, and then it is done.',
  hunt1: 'One! One last thing standing in the whole sky. Go — find it!',
  /* THE HINT, AND IT NAMES THE PLACE. "Remind them to unlock the Sense
     Mischief ability with Ice Whisker at the Ice floating island." A hint that
     names an ability and not a destination is a hint a kid cannot act on, and
     the island is the half of it she can actually find from the map.

     AND IT IS SNOWMANTLE WHO IS NAMED, not the buff. The six leaders speak in
     the first person and name their own buff (voices.md again); this is the
     elder naming a leader, which is how every other pointer in this game
     works — you are sent to a person at a place, not to a menu entry. */
  huntIce: 'Still looking? Snowmantle of Icewhisker can feel the last unbroken '
    + 'thing anywhere in the sky. Her shrine is out on the frozen island — '
    + 'swear to her, and she will show you where to look.',
  huntIce2: 'The frozen island, little one. Icewhisker finds what everyone '
    + 'else walked past.',
};

/** Her card's dressing. The parchment the finale's dialogue box uses, not Mr
 *  Satan's gold — the girls tell a Patchfur scene from a Ryuuseki scene by its
 *  colour already, and this is the same voice in a smaller box. */
export const HUNT_WHO = { name: 'PATCHFUR', sub: 'Calico', colour: '#e8c98a' };

export class LastHunt {
  /**
   * @param {object} o
   * @param {Announcer} o.announcer  the card she borrows
   * @param {?object}   o.art        her sprite sheet, for the portrait
   */
  constructor({ announcer = null, art = null } = {}) {
    this.announcer = announcer;
    this.art = art;
    /** The last count she has SAID. Starts above the window so the first tick
     *  inside it announces, and is the only state this class has about the
     *  world. */
    this.said = Infinity;
    /** How long since the number last moved, and how many times she has
     *  offered the hint. */
    this.stuck = 0;
    this.hints = 0;
    this.nextHint = STUCK_FIRST;
    /** How many are left, as last told. Read by `mapOn`. */
    this.left = Infinity;
  }

  /** Whether the maps should be pointing at the nearest one. */
  get mapOn() { return this.left > 0 && this.left <= MAP_FROM; }

  /** Whether she is in the middle of counting at all. */
  get counting() { return this.left > 0 && this.left <= HUNT_FROM; }

  /**
   * Adopt a count without saying anything about it.
   *
   * FOR A LOADED GAME, AND IT IS NOT THE SAME AS `tick`. A save taken at three
   * remaining is loaded at three remaining, and announcing "Three!" over the
   * loading screen would be the elder reacting to something that happened
   * yesterday. The map still comes on, because the map is about where the
   * player is now rather than about what just happened.
   */
  sync(left) {
    this.left = left;
    this.said = left;
    this.stuck = 0;
    this.nextHint = STUCK_FIRST;
  }

  /**
   * One more piece of mischief is down. Say so, if it is worth saying.
   *
   * IDEMPOTENT ON THE NUMBER, which matters more than it looks: `onMischief`
   * can fire twice for one prop in the frame a dragon's breath crosses a market
   * stall, and a `hunt3` queued twice is the elder saying the same thing to
   * herself. Only a count she has not said yet is announced, and only ever
   * downwards.
   */
  tick(left) {
    const was = this.left;
    this.left = left;
    if (left !== was) {
      /* THE CLOCK RESTARTS WHENEVER THE NUMBER MOVES, including on the way into
         the window: a pair who reach five after a long search have not been
         stuck, and the minute is about the NEXT one. */
      this.stuck = 0;
      this.nextHint = STUCK_FIRST;
    }
    if (left <= 0 || left > HUNT_FROM || left >= this.said) return;
    this.said = left;
    this._say(`hunt${left}`);
  }

  /**
   * The stalled-hunt hint.
   *
   * @param {number} dt
   * @param {boolean} anyoneHasIt  does somebody in the party already have Sense
   *        Mischief? "If they don't already have it enabled" — a hint that
   *        tells you to go and get a thing you are holding is the game not
   *        looking at you.
   */
  update(dt, anyoneHasIt = false) {
    if (!this.counting || anyoneHasIt || this.hints >= STUCK_MAX) return;
    this.stuck += dt;
    if (this.stuck < this.nextHint) return;
    this.hints += 1;
    this.nextHint = this.stuck + STUCK_AGAIN;
    /* THE SECOND TELLING IS SHORTER. The first one has to carry the whole
       instruction — who, what and where; after that she is reminding, and a
       reminder that repeats the full sentence reads as a recording rather than
       as somebody in the room. */
    this._say(this.hints === 1 ? 'huntIce' : 'huntIce2');
  }

  /** Back to knowing nothing, for a restart. */
  reset() {
    this.said = Infinity;
    this.left = Infinity;
    this.stuck = 0;
    this.hints = 0;
    this.nextHint = STUCK_FIRST;
  }

  _say(id) {
    const text = HUNT_LINES[id];
    if (!text) return;
    this.announcer?.say?.(id, text, { ...HUNT_WHO, art: this.art });
  }
}
