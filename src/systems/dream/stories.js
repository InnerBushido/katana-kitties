/* ---------------------------------------------------------------------------
   THE DREAM DOJO'S STORIES — every line the new scenes say, in one place.

   THE CARD AND THE RECORDING ARE ONE STRING (docs/notes/voices.md). Each row
   is `{ who, text, voice }`; `voice` is the clip id, and the clip is a render
   of exactly `text`. Change a line here and its clip is stale.

   WHO SAYS WHAT. Lionheart is Barrett (`lion_*`, public/voice/lionheart/),
   Payne is Pixie (`payne_*`, public/voice/payne/ — her rows are ALSO in
   `PAYNE_LINES`, which is the list her own world-check asks about, so a tour
   line is one of her lines like any other). Payne has approved her lines
   and her voice, these with the rest (docs/notes/payne.md).

   HIS LINES ARE NOT SEDUCTIVE (voices.md: "we don't want it to sound too
   seductive, so need to be careful with the wording"). They are a coach
   talking to a nine-year-old about practice, and they say so plainly.

   THE THREE SCENES, and whose words they are:
   · TOUR — Payne's "VIEW THE DREAM DOJO". Richard: "a little introduction
     cutscene, working like the Clan Leaders introduction cutscene but longer
     and more detailed introducing all the different things that can be done
     in the Dream Dojo, explaining what the Dream Dojo is, why it is there ...
     and introducing Lionheart, his background/history in the world and why he
     created the Dream Dojo, to train the next generation of fighters to be
     strong and fierce, independent, and wise kitty-beings that have no fear
     and always do what is just and honorable to live their best life and help
     create equanimity throughout all the islands, worlds, galaxies, and
     'multi-real-and-virtual realities' as they are all tangential (or is it
     tangible?) and matter according to him." The last line keeps his own
     "(or is it tangible?)" as Lionheart's joke on himself.
   · HONOR — after she tried the improper way in and then came in by the
     stones: "he can apologize for getting angry and be understanding that,
     they were just being Mischievous ... why try to sneak into a space when
     the front door is already opened for them to enter? ... In Japanese, 'Do'
     means 'the way' ... not the easy way, but through toughness,
     perseverance, and repetitive practice".
   · FALL — after she fell off the stones: "anything good in life requires a
     bit of struggle and sometimes, things don't always work out, but if you
     fall, just need to pick yourself up again and try again, until you
     finally succeed and make it to your destination!"
--------------------------------------------------------------------------- */

/** One row of a scene. `shot` names a camera in dream/storyscene.js. */
const L = (voice, text, shot) => ({ who: 'lion', voice, text, shot });
const P = (voice, text, shot) => ({ who: 'payne', voice, text, shot });

export const TOUR = [
  P('payne_tour_1', "See that floating island past the Dojo of the Turning Circle? That's the DREAM DOJO!", 'isleWide'),
  P('payne_tour_2', "You jump across the floating stones to get there. Miss one? No biggie — you pop right back at the start!", 'stones'),
  P('payne_tour_3', "It's a hologram dojo, inside a bubble of light. No dragons allowed — kittens only, through the front door!", 'sign'),
  L('lion_tour_hi', 'Welcome, young warriors! I am Lionheart, and this is my Dream Dojo.', 'lionClose'),
  L('lion_tour_past', 'I have trained with the sword since I was a kitten no bigger than you. I fell down a thousand times — and got up a thousand and one.', 'lionOrbit'),
  L('lion_tour_why', 'So I built a dojo out of light, where any kitten can train — and nothing you break in here stays broken.', 'gear'),
  P('payne_tour_4', "Talk to Lionheart, grab your VR gear, step into your tube and — whoosh! You're inside the simulator!", 'tubes'),
  L('lion_tour_learn', 'In here you learn your Kotodama, your clan powers, real sword skills, and how to fight — and you get a little better every single day.', 'simHub'),
  L('lion_tour_isles', 'Every island is a lesson: aim, timing, kata, even the maths of the circle. Earn stars, and climb the ranks of KENSHI!', 'simIsles'),
  L('lion_tour_shadow', 'And at the very end waits my Shadow. Beat him, and you earn a share of my HONOR — and a SPECIAL Kotodama.', 'simShadow'),
  L('lion_tour_mission1', 'I train the next generation of fighters to be strong and fierce, independent and wise. Kitty-beings with no fear...', 'lionHero'),
  L('lion_tour_mission2', '...who always do what is just and honorable, and live their very best lives.', 'lionHero2'),
  L('lion_tour_mission3', 'Together, we bring equanimity — balance and calm — to every island, every world, every galaxy...', 'skyPull'),
  L('lion_tour_mission4', '...and every reality, real AND virtual. They are all tangential. Or is it tangible? ...BOTH! They all matter.', 'skyPull2'),
  P('payne_tour_5', "He talks like that ALL the time. You get used to it! Now go and give it a try — I'll be right here.", 'isleEnd'),
];

export const HONOR = [
  L('lion_honor_1', "Ah — you made it in. The PROPER way! Listen... I'm sorry I shouted. I got a little overexcited.", 'ots'),
  L('lion_honor_2', 'You were just being mischievous. I understand — kittens like to have fun. So do I!', 'otsLion'),
  L('lion_honor_3', 'But tell me this: why sneak in over the wall, when the front door was already open for you?', 'ots'),
  L('lion_honor_4', 'In Japanese, DO means THE WAY. Kendo, judo, aikido — every one of them is a way.', 'otsLion'),
  L('lion_honor_5', 'And the way is not the easy way. It is toughness, patience, and practice — again, and again, and again.', 'ots'),
  L('lion_honor_6', 'So never run from a little struggle. That is where real strength, and real character, are built.', 'otsLion'),
  L('lion_honor_7', 'From now on, do things DO — the true way. Now... welcome to the Dream Dojo!', 'otsWide'),
];

export const FALL = [
  L('lion_fall_1', "You fell on the way here, didn't you? Don't worry. Everybody falls. I have fallen more times than I can count.", 'ots'),
  L('lion_fall_2', "Anything good in life takes a little struggle. And sometimes, things just don't work out.", 'otsLion'),
  L('lion_fall_3', 'But when you fall, you pick yourself up — and you try again. And again...', 'ots'),
  L('lion_fall_4', '...until you finally make it to where you were going. Just like you did! Welcome to the Dream Dojo!', 'otsWide'),
];

/** The gear-up, said by the real Lionheart as bubbles (DreamDojo.say). Text
 *  with newlines, read as spaces in the recording, like LION_LINES. */
export const GEAR_LINES = {
  first: 'First time? You need your VR gear!\nGrab a headset, gloves and a tracking suit\nfrom the glowing racks — then you are ready!',
  again: 'Back for more training?\nGood! Face the front... and SUIT UP!',
  suit: 'All your gear! Face the front...\nand SUIT UP!',
  talk: 'Your gear is waiting!\nTalk to me first, and I will suit you up.',
};
export const GEAR_VOICE = {
  first: 'lion_gear_first',
  again: 'lion_gear_again',
  suit: 'lion_gear_suit',
};

/** Every scene row, for the checks and the voice preloads. */
export const STORY_ROWS = [...TOUR, ...HONOR, ...FALL];
