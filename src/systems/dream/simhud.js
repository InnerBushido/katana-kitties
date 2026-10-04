/* ---------------------------------------------------------------------------
   THE GAME, AS A KITTEN IN THE SIMULATOR SEES IT.

   `Player.update` is handed `hud` — the Game — and asks it a short list of
   questions: may I fight (`arenaLive`), who could I aim at (`players`), did my
   swing reach anybody (`strikePlayers`), did I knock something over
   (`onMischief`), is a rat in my mouth (`critterHold`). In the real world
   every answer is the real one. In here, six of them have to be different,
   and this Proxy is the whole of the difference — `Player` is not told.

     · `arenaLive` is YES. The simulator is a training ring: "they can also
       apply different Clan abilities here", and the two clan powers that only
       work in a live round (盗 Steal Mischief and 息 Dragon Breath) are exactly
       the ones a kitten could never have practised before.
     · `players` is the HOLOGRAMS (`TrainingGate.fighters`). A mark or a Flash
       Step lock chooses from this list, so in here it can only ever choose a
       holo-kitten. Never her sisters — they are not on it.
     · `tournament.allies` is never — there are no sides in a drill.
     · `strikePlayers` is `TrainingGate.strike`. NOT a second combat gate: the
       real one would refuse anyway (no round is ever live while anybody is in
       here — `DreamDojo.update` pulls everybody out first), and this one can
       only find holograms. A kitten in the sim cannot hurt a kitten anywhere.
     · `onMischief`, `strikeCritters`, `strikeWards` do nothing. Nothing in
       here is the town's, and nothing in here counts.
     · `critterHold` is the Feast's: is this press the EAT gesture.

   Everything else is the Game, bound to the Game, so `hud.sfx` and `hud.toast`
   behave exactly as they always have.

   A REAL `Proxy`, for the reason `DreamDojo.ownerFor` gives: a copy made with
   `Object.create` would take every write on itself and lose it.
--------------------------------------------------------------------------- */

/** The tournament as a drill sees it: nobody is on anybody's side. */
const NO_SIDES = Object.freeze({ allies: () => false, active: false, fighting: false });

export function makeSimHud(game, dream) {
  const bound = new Map();
  const over = {
    arenaLive: (q) => !!q && !q.ko && !q.angel,
    strikePlayers: (attacker, kind, reach, dir, spent = null) => {
      dream.onStrike(attacker, kind, reach, dir, spent);
    },
    strikeCritters: () => 0,
    strikeWards: () => false,
    onMischief: () => {},
    /* THE FEAST'S ANIMALS ARE HERS TO EAT — `DreamDojo.critterHold`. This was
       `() => false`, and it is the question the Cross Slash asks before it
       takes ATTACK for itself (`Player.update`'s `deferred`): so in the
       simulator a kitten wearing the orb who stood over a stunned holo-rat
       and held the button got the technique, every time, and could never
       eat. Richard: "We should try to use the same logic, as is in the
       arena" — so it is the arena's rule (`Menagerie.wouldHold`), asked of
       the drill that owns the animals. */
    critterHold: (q) => dream.critterHold(q),
    onJoinClan: () => {},
    onMeetLeader: () => false,
    onPandaShrine: () => {},
  };
  return new Proxy(game, {
    get(target, key) {
      if (key === 'players') return dream.gate.fighters;
      if (key === 'tournament') return NO_SIDES;
      if (key === 'ryu') return null;
      if (Object.prototype.hasOwnProperty.call(over, key)) return over[key];
      const v = Reflect.get(target, key);
      if (typeof v !== 'function') return v;
      // Bound once and kept: `sfx` is called fifty ways a frame.
      let f = bound.get(key);
      if (!f || f.src !== v) {
        f = v.bind(target);
        f.src = v;
        bound.set(key, f);
      }
      return f;
    },
  });
}
