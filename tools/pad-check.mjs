/* ---------------------------------------------------------------------------
   Headless controller-compatibility check.

     node tools/pad-check.mjs

   The Joy-Con setup is the one that gets played, so it is the one that gets
   tested by hand. Everything else — a PS4 pad, an Xbox pad, a cheap USB pad,
   two of anything at once — is only ever exercised by whichever controller
   happens to be on the desk, which is none of them.

   This drives the REAL InputManager with synthetic `navigator.getGamepads()`
   fixtures: real id strings, real button counts, real HID orders. It cannot
   tell you a stick feels right, but it settles every question that is actually
   about code — which profile matches, which player slot binds to which pad,
   which physical button lights which action, and whether two pads stay
   independent.

   Fixtures are Windows layouts, which is what this machine is.
--------------------------------------------------------------------------- */

/* input.js is browser code: it wires window listeners and reads localStorage in
   its constructor. Stub before the import, because ESM hoists imports and the
   module body would otherwise run first. */
globalThis.window = { addEventListener: () => {} };
globalThis.localStorage = {
  _s: new Map(),
  getItem(k) { return this._s.has(k) ? this._s.get(k) : null; },
  setItem(k, v) { this._s.set(k, String(v)); },
  removeItem(k) { this._s.delete(k); },
};

const { InputManager, ACTIONS, KEYSETS, BOUND_KEYS } = await import('../src/core/input.js');

const line = (l, v) => console.log(String(l).padEnd(46) + v);
let fails = 0;
let checks = 0;
const ok = (label, cond, extra = '') => {
  checks++;
  if (!cond) fails++;
  line(label, (cond ? 'ok   ' : 'FAIL ') + extra);
};

/* ------------------------------ fixtures -------------------------------- */

function buttons(n, down = []) {
  return Array.from({ length: n }, (_, i) => ({
    pressed: down.includes(i),
    value: down.includes(i) ? 1 : 0,
    touched: down.includes(i),
  }));
}

function pad(index, o) {
  return {
    index,
    connected: true,
    mapping: '',
    timestamp: 1,
    axes: [0, 0, 0, 0],
    ...o,
    buttons: buttons(o.buttonCount ?? 16, o.down ?? []),
  };
}

/* The W3C "standard gamepad": every pad below that Windows + the browser
   remaps lands on exactly this, whatever the plastic says.
     0 bottom face   1 right face   2 left face   3 top face
     4 L1  5 R1  6 L2  7 R2  8 select/share  9 start/options
     10 L3 11 R3  12/13/14/15 dpad U/D/L/R  16 guide            */
const STANDARD = {
  cross: 0, circle: 1, square: 2, triangle: 3,
  l1: 4, r1: 5, l2: 6, r2: 7, share: 8, options: 9, l3: 10, r3: 11,
  up: 12, down: 13, left: 14, right: 15, ps: 16,
};

/* DualShock 4 with NO remap applied — raw HID report order. This is the shape
   that matters, because it is what the `generic` profile has to cope with, and
   the face cluster is in a different order from the standard one above. */
const DS4_RAW = {
  square: 0, cross: 1, circle: 2, triangle: 3,
  l1: 4, r1: 5, l2: 6, r2: 7, share: 8, options: 9, l3: 10, r3: 11, ps: 12,
  touchpad: 13,
};

const DEVICES = {
  /* Chrome and Firefox both carry a remap table for the DS4; the id strings
     differ, the mapping does not. */
  ds4Chrome: () => pad(0, {
    id: 'Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 09cc)',
    mapping: 'standard', buttonCount: 17, axes: [0, 0, 0, 0],
  }),
  ds4Firefox: () => pad(0, {
    id: '054c-09cc-Wireless Controller',
    mapping: 'standard', buttonCount: 17, axes: [0, 0, 0, 0],
  }),
  dualsense: () => pad(0, {
    id: 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)',
    mapping: 'standard', buttonCount: 17, axes: [0, 0, 0, 0],
  }),
  xbox: () => pad(0, {
    id: 'Xbox 360 Controller (XInput STANDARD GAMEPAD)',
    mapping: 'standard', buttonCount: 17, axes: [0, 0, 0, 0],
  }),
  /* The failure case: a pad the browser has no table for. Axes 3 and 4 are the
     analog triggers, which REST AT -1 — the reason a fallback profile must not
     assume axes[2]/[3] are a second stick. */
  ds4NoRemap: () => pad(0, {
    id: '054c-09cc-Wireless Controller',
    mapping: '', buttonCount: 14, axes: [0, 0, 0, -1, -1, 0, 0, 0, 0],
  }),
  genericUsb: () => pad(0, {
    id: 'USB Gamepad (Vendor: 0079 Product: 0006)',
    mapping: '', buttonCount: 12, axes: [0, 0, 0, 0],
  }),
  /* The current setup, kept here as a regression: both Joy-Cons through
     Joy2Win + vJoy as ONE pad that has to be split down the middle. */
  vjoy: () => pad(0, {
    id: 'vJoy Device (Vendor: 1234 Product: bead)',
    mapping: '', buttonCount: 38, axes: [0, 0, 0, 0, 0, -1, -1, -1],
  }),
};

/**
 * Run the real update loop over a fixed set of pads.
 *
 * IT ARRIVES WITH NOTHING HELD, AND THEN SOMEBODY PRESSES. That extra first
 * frame is not ceremony — without it these tests describe a physically
 * impossible pad, one that has been holding a button since before it existed,
 * and they were passing on exactly the state that shipped Richard's bug: vJoy
 * reporting button 9 down at 1.00 forever, and the title screen's any-button
 * rule starting the game on it. `InputManager` now masks the buttons a vJoy pad
 * is ALREADY holding when it first appears (see LATCHED in core/input.js), so a
 * harness that never lets go is asking the code to ignore its press and then
 * failing it for doing so.
 *
 * Buttons are lifted rather than the pads being swapped, so identity, index and
 * axes are untouched and only the thing under discussion changes.
 */
function drive(pads, { padMode = 'auto' } = {}) {
  const im = new InputManager();
  im.padMode = padMode;
  globalThis.navigator = { getGamepads: () => pads };
  const held = pads.map((p) => p.buttons);
  pads.forEach((p) => { p.buttons = buttons(p.buttons.length, []); });
  im.update();   // the pad appears, holding nothing
  pads.forEach((p, i) => { p.buttons = held[i]; });
  im.update();   // ...and now she presses, which seeds `prev`
  im.update();
  return im;
}

Object.defineProperty(globalThis, 'navigator', {
  value: { getGamepads: () => [] }, writable: true, configurable: true,
});

/* ----------------------- 1. profile resolution --------------------------- */

console.log('\n--- which profile matches which device ---');
const EXPECTED_PROFILE = {
  ds4Chrome: 'standard',
  ds4Firefox: 'standard',
  dualsense: 'standard',
  xbox: 'standard',
  ds4NoRemap: 'generic',
  genericUsb: 'generic',
  vjoy: 'vjoyDual',
};
const im0 = drive([]);
for (const [name, make] of Object.entries(DEVICES)) {
  const got = im0.profileNameFor(make());
  ok(`${name} -> ${EXPECTED_PROFILE[name]}`, got === EXPECTED_PROFILE[name], `got ${got}`);
}

/* The vJoy test is a regex over the id. A real pad matching it would be split
   in half and handed to two players, which is a spectacular way to fail. */
console.log('\n--- no real pad is mistaken for the merged vJoy pad ---');
for (const [name, make] of Object.entries(DEVICES)) {
  if (name === 'vjoy') continue;
  ok(`${name} is not vjoyDual`, im0.profileNameFor(make()) !== 'vjoyDual');
}

/* ------------------- 2. one standard pad, one player --------------------- */

console.log('\n--- one PS4 pad: buttons land on the right actions ---');
function actionFor(deviceName, buttonIndex) {
  const p = DEVICES[deviceName]();
  p.buttons = buttons(p.buttons.length, [buttonIndex]);
  const im = drive([p]);
  return ACTIONS.filter((a) => im.players[0].down(a));
}
const EXPECT_STANDARD = {
  cross: ['jump'],
  square: ['attack'],
  circle: ['interact'],
  triangle: ['mount'],
  l2: ['sprint'],
  r2: ['sprint'],
  l3: ['sprint'],
  options: ['start'],
  // The two bumpers were the only buttons a standard pad never used, so map
  // zoom and the maths overlay went there rather than onto a modifier combo.
  r1: ['map'],
  l1: ['math'],
  share: ['map'],   // second binding; Guide (16) backs up `math` the same way
  ps: ['math'],
};
for (const [btn, want] of Object.entries(EXPECT_STANDARD)) {
  const got = actionFor('ds4Chrome', STANDARD[btn]);
  ok(`DS4 ${btn.padEnd(8)} -> ${want.join(',') || '(nothing)'}`,
    got.join(',') === want.join(','), `got ${got.join(',') || '(nothing)'}`);
}

/* One press must never fire two actions — the joyconSideways comment records
   what that cost: jumping also threw you off the dragon. */
console.log('\n--- one press, one action ---');
for (const dev of ['ds4Chrome', 'xbox', 'ds4NoRemap', 'genericUsb']) {
  const p = DEVICES[dev]();
  let worst = '';
  for (let i = 0; i < p.buttons.length; i++) {
    const got = actionFor(dev, i);
    if (got.length > 1) worst += ` btn${i}->${got.join('+')}`;
  }
  ok(`${dev}: no button fires two actions`, worst === '', worst);
}

console.log('\n--- one PS4 pad: left stick, deadzone, dpad ---');
{
  const p = DEVICES.ds4Chrome();
  p.axes = [1, 0, 0, 0];
  let im = drive([p]);
  ok('push right -> mx > 0.9', im.players[0].mx > 0.9, `mx=${im.players[0].mx.toFixed(2)}`);

  p.axes = [0, -1, 0, 0];
  im = drive([p]);
  ok('push up -> my < -0.9', im.players[0].my < -0.9, `my=${im.players[0].my.toFixed(2)}`);

  p.axes = [0.15, 0.15, 0, 0];   // stick drift
  im = drive([p]);
  ok('resting drift is deadzoned', im.players[0].mx === 0 && im.players[0].my === 0);

  /* A DS4 in standard mapping puts the triggers on BUTTONS, so the axes are
     two clean sticks. Nothing should move when only the right stick does. */
  p.axes = [0, 0, 1, -1];
  im = drive([p]);
  ok('right stick does not drive movement',
    im.players[0].mx === 0 && im.players[0].my === 0);

  const dp = DEVICES.ds4Chrome();
  dp.buttons = buttons(17, [STANDARD.left]);
  im = drive([dp]);
  ok('dpad left -> mx < 0', im.players[0].mx < 0, `mx=${im.players[0].mx}`);
}

console.log('\n--- one pad only: player 2 stays on the keyboard ---');
{
  const im = drive([DEVICES.ds4Chrome()]);
  ok('P1 source is gamepad', im.players[0].source === 'gamepad');
  ok('P2 source is keyboard', im.players[1].source === 'keyboard');
  ok('P2 is not bound to P1 pad', im.bindings[1].pad == null);
}

/* CONTROLLERS FILL FROM PLAYER 1 DOWN, THEN WASD, THEN THE ARROW KEYS. The
   keyboard sets are a QUEUE rather than player 2's and player 3's property:
   whoever is first out of the controllers gets WASD, because WASD with a space
   bar beats the arrow keys with a numpad and no kid should be handed the worse
   half on account of her slot number.

   This replaces a slot-affinity rule that gave slot 1 `KEYSETS[1]` whenever it
   was free — so ONE pad put player 2 on the arrows and pushed WASD down to
   player 3, which is backwards. */
console.log('\n--- how many controllers -> who is on what ---');
{
  const mkPad = (i) => { const p = DEVICES.ds4Chrome(); p.index = i; return p; };
  const layout = (im, n) => im.bindings.slice(0, n)
    .map((b) => (b.pad != null ? 'pad' : b.keyset === 0 ? 'WASD' : b.keyset === 1 ? 'Arrows' : '-'))
    .join(' ');

  const zero = drive([]);           zero.slots = 2; zero.update();
  ok('0 controllers: P1 WASD, P2 Arrows', layout(zero, 2) === 'WASD Arrows', layout(zero, 2));

  const one = drive([mkPad(0)]);    one.slots = 3; one.update();
  ok('1 controller: P1 pad, P2 WASD, P3 Arrows',
    layout(one, 3) === 'pad WASD Arrows', layout(one, 3));

  const two = drive([mkPad(0), mkPad(1)]); two.slots = 4; two.update();
  ok('2 controllers: P1 pad, P2 pad, P3 WASD, P4 Arrows',
    layout(two, 4) === 'pad pad WASD Arrows', layout(two, 4));

  const three = drive([mkPad(0), mkPad(1), mkPad(2)]); three.slots = 4; three.update();
  ok('3 controllers: P1-P3 pads, P4 WASD',
    layout(three, 4) === 'pad pad pad WASD', layout(three, 4));

  const four = drive([mkPad(0), mkPad(1), mkPad(2), mkPad(3)]); four.slots = 4; four.update();
  ok('4 controllers: nobody is on the keyboard',
    layout(four, 4) === 'pad pad pad pad', layout(four, 4));

  /* A TWO-PLAYER GAME WITH ONE PAD NOW PUTS P2 ON WASD, which is the one thing
     this rule deliberately changes about the game the girls already know. */
  const duo = drive([mkPad(0)]);
  ok('one pad, two players: P2 is on WASD not the arrows',
    duo.bindings[1].keyset === 0, JSON.stringify(duo.bindings[1]));
}

/* --------------------- 3. TWO pads, two players -------------------------- */

console.log('\n--- two PS4 pads at once ---');
{
  const a = DEVICES.ds4Chrome();
  const bpad = DEVICES.ds4Chrome();
  bpad.index = 1;
  a.buttons = buttons(17, [STANDARD.cross]);       // P1 jumps
  bpad.buttons = buttons(17, [STANDARD.square]);   // P2 slashes
  a.axes = [1, 0, 0, 0];
  bpad.axes = [-1, 0, 0, 0];
  const im = drive([a, bpad]);

  ok('P1 <- pad 0', im.bindings[0].pad === 0, JSON.stringify(im.bindings[0]));
  ok('P2 <- pad 1', im.bindings[1].pad === 1, JSON.stringify(im.bindings[1]));
  ok('both slots read a gamepad',
    im.players[0].source === 'gamepad' && im.players[1].source === 'gamepad');
  ok('neither pad is split in half',
    im.bindings[0].half == null && im.bindings[1].half == null);
  ok('P1 jump, P2 not', im.players[0].down('jump') && !im.players[1].down('jump'));
  ok('P2 attack, P1 not', im.players[1].down('attack') && !im.players[0].down('attack'));
  ok('sticks are independent',
    im.players[0].mx > 0.9 && im.players[1].mx < -0.9,
    `${im.players[0].mx.toFixed(2)} / ${im.players[1].mx.toFixed(2)}`);
  ok('describe() names both', im.describe().every((s) => /gamepad/.test(s)),
    im.describe().join(' | '));
}

console.log('\n--- two pads of DIFFERENT kinds (PS4 + Xbox) ---');
{
  const a = DEVICES.ds4Chrome();
  const x = DEVICES.xbox();
  x.index = 1;
  a.buttons = buttons(17, [STANDARD.triangle]);
  x.buttons = buttons(17, [STANDARD.triangle]);
  const im = drive([a, x]);
  ok('both resolve mount', im.players[0].down('mount') && im.players[1].down('mount'));
  ok('bound to different pads', im.bindings[0].pad !== im.bindings[1].pad);
}

console.log('\n--- three pads: the first two win, in connection order ---');
{
  const pads = [DEVICES.ds4Chrome(), DEVICES.xbox(), DEVICES.dualsense()];
  pads[1].index = 1;
  pads[2].index = 2;
  const im = drive(pads);
  ok('P1 <- pad 0 and P2 <- pad 1',
    im.bindings[0].pad === 0 && im.bindings[1].pad === 1);
}

/* --------------- 3b. the pad that arrives already pressing ---------------- */

/* REPORTED AS "2 controllers connected and one of them autostarts the game",
   and it was not a phantom. vJoy reported button 9 held at 1.00 permanently -
   button 9 is `attack` on the left Joy-Con half - and the title screen's
   any-button rule started the game on it, every time, before anybody had
   touched anything. There is no way to play the game from that state and no
   way to see why from inside it.

   THE MASK IS TAKEN ON ARRIVAL AND ONLY FOR VJOY, which is the asymmetry worth
   spelling out. A real HID pad is not surfaced by the browser at all until a
   human presses something on it, so its very first frame legitimately has a
   button down and latching it would eat the wake-up press - the pad would look
   dead. vJoy is a driver device that is simply always there, so a button down
   on its first frame is a stuck axis, not a person.

   It clears the moment she lets go, so this costs a stuck pad nothing except
   the one press it was never making. */
console.log('\n--- a pad that arrives holding a button is not pressing it ---');
{
  /* NOT through `drive` - the whole point is the arrival frame `drive` now
     inserts, so this has to hand the pad over with the button already down. */
  const raw = (pads, opts = {}) => {
    const im = new InputManager();
    im.padMode = opts.padMode ?? 'auto';
    globalThis.navigator = { getGamepads: () => pads };
    im.update();
    im.update();
    return im;
  };

  const v = DEVICES.vjoy();
  v.buttons = buttons(38, [9]);
  const stuck = raw([v]);
  ok('a vJoy pad holding a button on arrival seats nobody',
    stuck.bindings.every((b) => b.pad == null), JSON.stringify(stuck.bindings));
  ok('...and the stuck button reads as up', !stuck.players[0].down('attack'));
  ok('...and it is named, so the readout can say why',
    stuck.latchedButtons(0).includes(9));

  /* AND IT LETS GO. A mask that outlived the stick would be the same bug with
     the sign flipped: a pad nobody could ever press. */
  v.buttons = buttons(38, []);
  stuck.update();
  ok('...until she releases it', stuck.latchedButtons(0).length === 0);
  v.buttons = buttons(38, [9]);
  stuck.update();
  stuck.update();
  ok('...and then the very same button works', stuck.players[0].down('attack'),
    JSON.stringify(stuck.bindings));

  /* A REAL PAD IS NOT LATCHED, and this is the check that stops somebody
     "simplifying" the vJoy gate away. Chrome and Firefox both withhold a HID
     pad from `getGamepads()` until it is used, so its first frame IS the
     press; masking it would make every controller in the house look broken. */
  const ds = DEVICES.ds4Chrome();
  ds.buttons = buttons(ds.buttons.length, [STANDARD.cross]);
  const live = raw([ds]);
  ok('a REAL pad arriving mid-press is seated on that press',
    live.bindings[0].pad === 0, JSON.stringify(live.bindings));
  ok('...and its button is not masked', live.latchedButtons(0).length === 0);
}

/* ------------------------ 4. the known traps ----------------------------- */

/* Only vjoyDual reads `half`. Splitting anything else gives both players one
   identical snapshot — the two kittens move as one and P2 has no controller
   while appearing to have one. SPLIT must not be able to cause that. */
console.log('\n--- padMode = split must not clone a normal pad ---');
for (const dev of ['ds4Chrome', 'xbox', 'genericUsb']) {
  const p = DEVICES[dev]();
  p.buttons = buttons(p.buttons.length, [STANDARD.cross]);
  const im = drive([p], { padMode: 'split' });
  ok(`${dev}: P2 not cloned onto P1's pad`, im.bindings[1].pad == null,
    JSON.stringify(im.bindings));
  ok(`${dev}: one press does not move both kittens`,
    im.players[0].down('jump') && !im.players[1].down('jump'));
  ok(`${dev}: no half assigned`, im.bindings[0].half == null);
}
{
  // ...and SPLIT still forces the split on the pad it was written for, even
  // alongside a second pad. The vJoy device has to be AWAKE to be split at
  // all now — a phantom is not two players any more than it is one.
  const v = DEVICES.vjoy();
  v.buttons = buttons(38, [2]);
  const p = DEVICES.ds4Chrome();
  p.index = 1;
  const im = drive([v, p], { padMode: 'split' });
  ok('SPLIT still splits the vJoy pad',
    im.bindings[0].half === 'left' && im.bindings[1].half === 'right',
    JSON.stringify(im.bindings));
}

/* THE vJOY DRIVER IS A PHANTOM CONTROLLER, and this is the check that did not
   exist. vJoy is a driver-level virtual joystick: once it is installed, Windows
   reports the device to the browser forever — with or without Joy2Win running,
   with or without a Joy-Con paired, and with or without any Nintendo hardware
   in the building. So the game saw a controller that was not there, handed it
   player 1, and left a kid on the keyboard wondering why nothing moved.

   ONLY A vJOY DEVICE IS ASKED TO PROVE ITSELF. Every real pad is hidden by the
   browser until it sends input, so by the time one appears somebody has used
   it — the gate is a no-op for real pads and would only be a source of
   mid-session churn if it ever misfired. */
console.log('\n--- a vJoy device nothing is feeding takes no seat ---');
{
  const im = drive([DEVICES.vjoy()]);
  ok('the phantom claims no player', im.bindings[0].pad == null,
    JSON.stringify(im.bindings[0]));
  ok('P1 falls through to WASD', im.bindings[0].keyset === 0);
  ok('P2 gets the arrows', im.bindings[1].keyset === 1);
  ok('both players are on the keyboard',
    im.players[0].source === 'keyboard' && im.players[1].source === 'keyboard');
  ok('and it seats only the two keyboard players', im.seatable === 2, `${im.seatable}`);
  /* STILL LISTED IN THE READOUT, flagged rather than hidden — otherwise "why
     can't the game see my Joy-Cons?" is undebuggable from inside the game,
     which is the whole job of that screen. */
  const diag = im.diagnostics();
  ok('...but the settings readout still shows it', diag.length === 1);
  ok('...flagged asleep', diag[0].asleep === true);
}

/* AND IT WAKES UP THE MOMENT IT SENDS ANYTHING. Two ways in, and both are
   needed: a stick can be pushed without a button ever being pressed, and a
   button can be pressed without a stick ever moving. */
console.log('\n--- ...and takes one as soon as it sends something ---');
{
  const v = DEVICES.vjoy();
  const im = drive([v]);
  ok('asleep to begin with', im.bindings[0].pad == null);
  v.buttons = buttons(38, [2]);          // somebody presses a button
  im.update();
  ok('a button press wakes it', im.bindings[0].pad === 0, JSON.stringify(im.bindings[0]));

  const v2 = DEVICES.vjoy();
  const im2 = drive([v2]);
  v2.axes = v2.axes.slice();
  v2.axes[0] = 0.9;                      // ...or somebody moves a stick
  im2.update();
  ok('a stick moving wakes it', im2.bindings[0].pad === 0, JSON.stringify(im2.bindings[0]));

  /* RESTING VALUES ARE NOT INPUT. The vJoy device rests with three axes at -1,
     so a liveness test written against zero would call it awake on frame one —
     which is the bug, not the fix. The range is measured from what the axes
     FIRST read, not from the origin. */
  const still = DEVICES.vjoy();
  const im3 = drive([still]);
  im3.update();
  im3.update();
  ok('resting axes at -1 are not mistaken for input', im3.bindings[0].pad == null,
    JSON.stringify(im3.bindings[0]));
}

/* SPLITTING IS PER DEVICE, NOT A MODE, AND THIS IS THE BLOCK THAT MATTERS.
   It used to be a global switch: either the vJoy pad was cut in half and you
   were in "split mode", or it wasn't. BOTH settings were wrong for the setup
   that prompted this — two Joy-Cons through Joy2Win PLUS a PS4 pad — because
   the question the switch asked ("do we split?") is a question about ONE DEVICE
   and it was being asked about the whole machine.

   Each pad is decided on its own now: a vJoy feed becomes two players, every
   ordinary controller becomes one, and they coexist. */
console.log('\n--- 2 Joy-Cons (Joy2Win) + a PS4 pad: all three at once ---');
{
  const v = DEVICES.vjoy();
  v.buttons = buttons(38, [2]);            // Joy2Win is feeding it
  const p = DEVICES.ds4Chrome();
  p.index = 1;
  const im = drive([v, p]);

  ok('the Joy-Cons are two devices', im.bindings[0].half === 'left'
    && im.bindings[1].half === 'right', JSON.stringify(im.bindings.slice(0, 2)));
  ok('...and the PS4 pad is a third', im._padDevices([v, p]).length === 3,
    JSON.stringify(im._padDevices([v, p])));
  im.slots = 3;
  im.update();
  ok('P1 left Joy-Con, P2 right Joy-Con, P3 the PS4 pad',
    im.bindings[0].half === 'left' && im.bindings[1].half === 'right'
    && im.bindings[2].pad === 1 && im.bindings[2].half == null,
    JSON.stringify(im.bindings.slice(0, 3)));
  ok('all three slots read a gamepad',
    [0, 1, 2].every((i) => im.players[i].source === 'gamepad'));
  ok('no two slots share a device',
    new Set(im.bindings.slice(0, 3).map((b) => `${b.pad}:${b.half}`)).size === 3);
  ok('and a fourth player still gets WASD', (im.slots = 4, im.update(),
    im.bindings[3].keyset === 0), JSON.stringify(im.bindings[3]));

  /* THE HALVES EXPAND IN PLACE, so "whichever connects first is player 1" holds
     whatever kind of controller that is. Hoisting them to the front was the old
     shape and it silently reordered everybody else. */
  const first = DEVICES.ds4Chrome();
  const second = DEVICES.vjoy();
  second.index = 1;
  second.buttons = buttons(38, [2]);
  const im2 = drive([first, second]);
  im2.slots = 3;
  im2.update();
  ok('a PS4 pad connected FIRST keeps player 1',
    im2.bindings[0].pad === 0 && im2.bindings[0].half == null,
    JSON.stringify(im2.bindings[0]));
  ok('...and the Joy-Cons follow it as P2 and P3',
    im2.bindings[1].half === 'left' && im2.bindings[2].half === 'right',
    JSON.stringify(im2.bindings.slice(1, 3)));
}

/* ONE PERSON HOLDING BOTH HALVES is the only thing the setting is still for,
   and it must not touch any other controller. */
console.log('\n--- padMode = single: the pair is one player, pads unaffected ---');
{
  const v = DEVICES.vjoy();
  v.buttons = buttons(38, [2]);
  const p = DEVICES.ds4Chrome();
  p.index = 1;
  const im = drive([v, p], { padMode: 'single' });
  ok('the pair is one device', im.bindings[0].half == null);
  ok('P1 <- the pair, P2 <- the PS4 pad',
    im.bindings[0].pad === 0 && im.bindings[1].pad === 1);
  ok('two devices plus two keysets seats four', im.seatable === 4, `${im.seatable}`);
  // The legacy spelling has to keep meaning the same thing.
  const legacy = drive([v, p], { padMode: 'separate' });
  ok('`separate` still means the same', legacy.bindings[0].half == null);
}

/* A PHANTOM IS NOT TWO PLAYERS ANY MORE THAN IT IS ONE. */
console.log('\n--- a phantom vJoy is still not split ---');
{
  const dead = drive([DEVICES.vjoy()]);
  ok('a phantom is not split into two players', dead.bindings[0].pad == null,
    JSON.stringify(dead.bindings[0]));
  ok('...and P1 falls through to WASD', dead.bindings[0].keyset === 0);
  const p = DEVICES.ds4Chrome();
  p.index = 1;
  const mixed = drive([DEVICES.vjoy(), p]);
  ok('a real pad beside a phantom still gets player 1',
    mixed.bindings[0].pad === 1, JSON.stringify(mixed.bindings[0]));
}

/* SEATABLE MUST AGREE WITH THE BINDER, and it did not: it counted the pads a
   second way, in its own copy of the split rule. The join screen refuses a
   claim past `seatable`, so a disagreement means a kid pressing START on a
   controller the binder has already dealt and being told the party is full. */
console.log('\n--- seatable counts what the binder deals ---');
{
  const none = drive([]);
  ok('no pads at all seats the two keyboard players', none.seatable === 2,
    `${none.seatable}`);
  const one = drive([DEVICES.ds4Chrome()]);
  ok('one pad plus two keysets seats three', one.seatable === 3, `${one.seatable}`);
  const mk = (i) => { const p = DEVICES.ds4Chrome(); p.index = i; return p; };
  const four = drive([mk(0), mk(1), mk(2), mk(3)]);
  ok('four pads still seats only four', four.seatable === 4, `${four.seatable}`);
}

/* --------------- 5. what an unremapped pad actually does ----------------- */

console.log('\n--- a pad with NO browser remap falls back to `generic` ---');
{
  const rows = [];
  for (const [name, i] of Object.entries(DS4_RAW)) {
    const got = actionFor('ds4NoRemap', i);
    if (got.length) rows.push(`${name}=${got.join(',')}`);
  }
  line('  raw DS4 button -> action', rows.join('  '));
  const p = DEVICES.ds4NoRemap();
  p.axes = [1, 0, 0, -1, -1, 0, 0, 0, 0];
  const im = drive([p]);
  ok('the left stick still works', im.players[0].mx > 0.9);
  ok('resting triggers do not move the kitten',
    drive([DEVICES.ds4NoRemap()]).players[0].my === 0);
  const cross = actionFor('ds4NoRemap', DS4_RAW.cross);
  ok('cross is NOT jump under the fallback', !cross.includes('jump'),
    `cross -> ${cross.join(',') || '(nothing)'}`);
}

/* The remap grid cannot rebind a PS4 pad — `standard` never reads vjoyMap. The
   thing that must not happen is it CORRUPTING the Joy-Con map while failing. */
console.log('\n--- remapping refuses any pad that is not the vJoy one ---');
for (const dev of ['ds4Chrome', 'xbox', 'genericUsb']) {
  const im = drive([DEVICES[dev]()]);
  const before = JSON.stringify(im.vjoyMap);
  ok(`${dev}: beginCapture refused`, im.beginCapture('left', 'jump') === false);
  ok(`${dev}: autoDetectSticks refused`, im.autoDetectSticks() === null);

  const p = DEVICES[dev]();
  p.buttons = buttons(p.buttons.length, [STANDARD.r1]);
  p.axes = [1, -1, 0.5, 0.5];
  globalThis.navigator = { getGamepads: () => [p] };
  im.update();
  ok(`${dev}: Joy-Con map untouched`, JSON.stringify(im.vjoyMap) === before);
}
{
  /* THE CALIBRATION SCREEN MUST SURVIVE THE PAD NOT BEING SPLIT. `beginCapture`
     used to find its pad through `bindings.find(x => x.half === half)` — a
     proxy for "the vJoy device" that only held while `auto` always split it.
     With the pad seating one player and `half: null`, that lookup found nothing
     and the whole Joy-Con remap screen went unreachable for the one device that
     cannot be played without it. It asks for the device by name now.
     Awake, because a pad nothing is feeding has nothing to press. */
  const v = DEVICES.vjoy();
  v.buttons = buttons(38, [2]);
  const im = drive([v]);
  ok('the vJoy pad is still remappable unsplit',
    im.beginCapture('left', 'jump') === true);
  im.cancelCapture();
  ok('...and its sticks are still auto-detectable', im.autoDetectSticks() !== null);
  ok('...but a phantom is not', drive([DEVICES.vjoy()]).beginCapture('left', 'jump') === false);
}

/* ENTER IS THE JOIN KEY, EVERY TIME, AND ESC IS THE KEYBOARD'S ONLY MENU KEY.

   It used to be each set's own start key, which meant the key that seated the
   next kitten MOVED depending on which set was already taken: with ONE
   controller connected, player 2 sits on WASD, so ENTER was HER PAUSE KEY and
   the only way in was the arrow set's `\`. Pressing the obvious ENTER opened
   the pause menu instead of seating anybody.

   Both sets answer to Enter now and `_findJoin` hands out the LOWEST FREE SET,
   so two keyboard players join one at a time by pressing it twice. That is only
   safe because a keyboard's `start` no longer pauses — see `Game._update`. */
console.log('\n--- ENTER joins, every time ---');
{
  const mkPad = (i) => { const p = DEVICES.ds4Chrome(); p.index = i; return p; };

  const none = drive([]);
  ok('0 controllers: both keysets are seated, so nothing can join',
    none.joinHint() === null, `${none.joinHint()}`);

  const one = drive([mkPad(0)]);
  ok('1 controller: P2 is on WASD...', one.bindings[1].keyset === 0);
  ok('...and ENTER is still the way in for P3',
    one.joinHint() === 'ENTER', `${one.joinHint()}`);

  const two = drive([mkPad(0), mkPad(1)]);
  ok('2 controllers: both keysets are free, so ENTER joins',
    two.joinHint() === 'ENTER', `${two.joinHint()}`);

  /* THE PRESS ITSELF, through the real edge detector, and it must hand out the
     LOWEST FREE SET rather than a set of its own choosing. */
  const press = (im, code) => {
    im.keys.clear(); im.update();          // clean previous frame for the edge
    im.keys.add(code); im.update();
    const c = im.pendingJoin();
    im.keys.clear();
    return c;
  };
  const solo = drive([mkPad(0)]);
  ok('ENTER seats the next keyboard player',
    JSON.stringify(press(solo, 'Enter')) === '{"pad":null,"half":null,"keyset":1}',
    JSON.stringify(press(solo, 'Enter')));

  /* TWO KEYBOARD PLAYERS JOIN ONE AT A TIME, on two presses of the same key —
     with two controllers seated, both sets are free, so the first press takes
     WASD and the second takes the arrows. */
  const kb = drive([mkPad(0), mkPad(1)]);
  ok('ENTER hands out WASD first', press(kb, 'Enter')?.keyset === 0,
    JSON.stringify(press(kb, 'Enter')));
  kb.slots = 3; kb.update();
  ok('...and the arrows on the next press', press(kb, 'Enter')?.keyset === 1,
    JSON.stringify(press(kb, 'Enter')));

  /* THE NUMPAD'S ENTER IS THE SAME KEY UNDER ANOTHER NAME. `\` is gone. */
  const np = drive([mkPad(0)]);
  ok('the numpad ENTER works too', press(np, 'NumpadEnter')?.keyset === 1);
  const bs = drive([mkPad(0)]);
  ok('`\\` no longer joins anybody', press(bs, 'Backslash') === null,
    JSON.stringify(press(bs, 'Backslash')));

  /* HOLDING ENTER MUST NOT SEAT BOTH KEYBOARD PLAYERS AT ONCE. The edge is
     latched against the one key now rather than one latch per set, which is
     exactly the case that would have slipped through the old spelling. */
  const held = drive([mkPad(0), mkPad(1)]);
  held.keys.clear(); held.update();
  held.keys.add('Enter'); held.update();
  const first = held.pendingJoin();
  held.slots = 3; held.update();            // she took WASD; Enter still down
  ok('holding ENTER seats one player, not two',
    first?.keyset === 0 && held.pendingJoin() === null,
    `${JSON.stringify(first)} then ${JSON.stringify(held.pendingJoin())}`);

  /* A SPARE CONTROLLER WINS THE HINT. Pressing START on a pad nobody is using
     is the easy answer whenever one is available. */
  const spare = drive([mkPad(0), mkPad(1)]);
  spare.slots = 1;
  spare.update();
  ok('a spare controller is named before a keyboard set',
    /controller/.test(spare.joinHint()), `${spare.joinHint()}`);

  /* AND IT GOES SILENT WHEN THE PARTY REALLY IS FULL, rather than naming a key
     that would be refused — the toast for that is a worse experience than the
     line simply not being there. */
  const full = drive([mkPad(0), mkPad(1), mkPad(2), mkPad(3)]);
  full.slots = 4;
  full.update();
  ok('a full party names no key', full.joinHint() === null, `${full.joinHint()}`);

  /* A PHANTOM vJOY MUST NOT PROMISE A SEAT. `seatable` counts it out, so the
     hint has to as well or it advertises a controller that is not there. */
  const phantom = drive([DEVICES.vjoy()]);
  ok('a phantom vJoy offers no controller to join on',
    phantom.joinHint() === null, `${phantom.joinHint()}`);
}

/* A CONNECTED CONTROLLER SHOULD BE A PLAYER. Three pads plugged in used to give
   two kittens and one controller that did nothing: it was dealt a device slot
   correctly and then sat unbound because the party was two, so it read as
   broken hardware rather than as a party nobody had grown. `Game._autoSeat`
   seats her from `sparePad` instead. START still works and is still explicit;
   this is the same thing happening without anybody having to know that. */
console.log('\n--- a spare controller somebody picks up becomes a player ---');
{
  const mkPad = (i, down = []) => {
    const p = DEVICES.ds4Chrome();
    p.index = i;
    p.buttons = buttons(17, down);
    return p;
  };

  /* CONNECTION IS NOT ENOUGH. A pad charging on the side, or left on the sofa,
     has sent nothing and must seat nobody — the same question the vJoy phantom
     has to answer, doing the same job. */
  const idle = drive([mkPad(0), mkPad(1), mkPad(2)]);
  ok('a pad nobody has touched is not offered', idle.sparePad() === null,
    JSON.stringify(idle.sparePad()));

  const woken = drive([mkPad(0), mkPad(1), mkPad(2, [STANDARD.cross])]);
  const dev = woken.sparePad();
  ok('a pad somebody picks up is offered', dev?.pad === 2, JSON.stringify(dev));
  ok('...and it is a spare, not one already being played',
    !woken.bindings.slice(0, 2).some((b) => b.pad === 2));

  /* ONE OFFER PER DEVICE. `hasSentInput` never goes back to false, so without
     the caller's latch a player who drops out would be re-seated on the next
     frame by the controller still in her hands and could never leave. */
  ok('an offer already taken is not repeated',
    woken.sparePad(new Set(['pad:2'])) === null,
    JSON.stringify(woken.sparePad(new Set(['pad:2']))));

  /* AND IT WORKS FOR THE COMBINATION THAT PROMPTED IT: two Joy-Cons arriving
     through Joy2Win as one vJoy device that has been split, plus a PS4 pad.
     The pad is the third device and nothing was seating anybody on it. */
  const v = DEVICES.vjoy();
  v.buttons = buttons(38, [2]);
  const p = mkPad(1, [STANDARD.cross]);
  const combo = drive([v, p], { padMode: 'split' });
  ok('split Joy-Cons take P1 and P2',
    combo.bindings[0].half === 'left' && combo.bindings[1].half === 'right');
  ok('...and the PS4 pad is offered as P3', combo.sparePad()?.pad === 1,
    JSON.stringify(combo.sparePad()));
}


/* ---------------------------------------------------------------------------
   THE KEYBOARD, WHICH IS THE OTHER HALF OF THIS FILE'S JOB.

   Everything above is about controllers, because that is where the surprises
   are. The keyboard was left to inspection — which was survivable while player
   2 had one key per action, and stopped being so the moment she got THREE, on
   two different hand positions, with three of the old keys moving to make room.
   A key bound twice is not a typo you can see: it is one press doing two things
   in a game nobody is testing with four people.
--------------------------------------------------------------------------- */
console.log('\n--- the keyboard sets ---');
{
  const FIELDS = ['up', 'down', 'left', 'right', ...ACTIONS];
  /* PAD-ONLY ACTIONS HAVE NO KEYSET ENTRY, deliberately: `map` and `math` stay
     on Z / X / M in the game's own keydown handler, so they keep working while
     somebody else is on a controller. */
  const PAD_ONLY = new Set(['map', 'math']);

  for (const ks of KEYSETS) {
    const bound = FIELDS.filter((f) => !PAD_ONLY.has(f));
    ok(`${ks.name}: every field is a LIST of codes`,
      bound.every((f) => Array.isArray(ks[f]) && ks[f].length > 0),
      bound.filter((f) => !Array.isArray(ks[f])).join(',') || '');
    ok(`${ks.name}: nothing pad-only leaked onto the keyboard`,
      [...PAD_ONLY].every((f) => ks[f] == null));

    /* NO KEY MAY DO TWO JOBS IN ONE SET. This is the check the whole block
       exists for: `;` used to be mount and is now "walk right", `/` used to be
       jump and is now attack, and Right Ctrl used to be sprint and is now jump.
       Every one of those is a key that would have fired two actions at once if
       the old binding had been left behind. */
    const seen = new Map();
    let clash = '';
    for (const f of bound) {
      for (const code of ks[f]) {
        if (seen.has(code)) clash = `${code}: ${seen.get(code)} + ${f}`;
        seen.set(code, f);
      }
    }
    ok(`${ks.name}: no key does two jobs`, !clash, clash);
  }

  /* AND NO KEY IS SHARED BETWEEN THE TWO SETS — one press must never move both
     kittens. Enter is the exception and it is the point of Enter: it is the
     JOIN key for both sets, dealt to the lowest free one, so that which key
     seats the next player never depends on who is already playing. */
  {
    const codes = (ks) => new Set(
      ['up', 'down', 'left', 'right', ...ACTIONS].flatMap((f) => ks[f] ?? [])
    );
    const [a, b2] = KEYSETS.map(codes);
    const shared = [...a].filter((c) => b2.has(c));
    ok('the two sets share only the join key',
      shared.every((c) => KEYSETS[0].start.includes(c)), shared.join(','));
  }

  /* PLAYER 2 CAN PLAY WITH ONE HAND, which is the whole point of the pass:
     player 1 has move + three buttons under her left hand alone (WASD, Q E F)
     and player 2 had nothing equivalent — the arrows are a right-hand shape but
     her buttons were a hand's width away on the numpad. */
  const P2 = KEYSETS[1];
  const has = (f, code) => (P2[f] ?? []).includes(code);
  ok('P2 walks on O K L ;',
    has('up', 'KeyO') && has('left', 'KeyK') && has('down', 'KeyL')
    && has('right', 'Semicolon'));
  /* P I J mirror Q E F: same three jobs, same shape, other hand. */
  ok('...with P I J mirroring P1\'s Q E F',
    has('mount', 'KeyP') && has('interact', 'KeyI') && has('attack', 'KeyJ')
    && KEYSETS[0].mount.includes('KeyQ') && KEYSETS[0].interact.includes('KeyE')
    && KEYSETS[0].attack.includes('KeyF'));
  /* RIGHT ALT JUMPS AND `'` SPRINTS, which is the swap the second real
     two-player session asked for and the opposite of how it shipped. The hand
     is the argument: played on O K L ; the right hand sits over the letter row,
     where Right Alt falls under the thumb and `'` is a pinky reach up and
     across — so the button pressed most often takes the thumb key. */
  ok('...and two ways to jump beside it', has('jump', 'AltRight') && has('jump', 'ControlRight'));
  ok('...and sprint off Right Ctrl, which is a jump key now',
    has('sprint', 'Quote') && has('sprint', 'ShiftRight')
    && !has('sprint', 'ControlRight'));
  /* THE SWAP HAS TO BE A SWAP. A key on both actions would fire two things on
     one press, which is the exact trap Right Ctrl fell into and the reason
     sprint moved off it in the first place. */
  ok('...and the two swapped keys did not land on the same action',
    !has('sprint', 'AltRight') && !has('jump', 'Quote'));

  /* THE OLD KEYS STILL WORK. Nothing a kid has already learned may stop
     working — the arrows and the numpad are how both girls have always played,
     and the punctuation run is the laptop's answer to a missing numpad. */
  ok('the arrows still walk her',
    has('up', 'ArrowUp') && has('down', 'ArrowDown')
    && has('left', 'ArrowLeft') && has('right', 'ArrowRight'));
  ok('the numpad still does all four buttons',
    has('jump', 'Numpad0') && has('attack', 'Numpad1')
    && has('interact', 'Numpad2') && has('mount', 'Numpad3'));
  /* , . / — one contiguous run beside the arrows. `'` used to close it as jump
     and is sprint now: still four keys under one hand, the last doing a
     different job. */
  ok('the laptop run is , . / = interact, mount, attack',
    has('interact', 'Comma') && has('mount', 'Period') && has('attack', 'Slash'));
  ok("...with ' beside it for sprint", has('sprint', 'Quote'));

  /* IF THE GAME BOUND IT, THE BROWSER MUST NOT ALSO ACT ON IT. Three of player
     2's keys are Firefox shortcuts — `/` and `'` open Quick Find, and a bare
     Alt focuses the menu bar — and Firefox is the browser this game is played
     in. `BOUND_KEYS` is derived from the sets, so a key added to a keyset is
     protected by having been added. */
  ok('every bound key is protected from the browser',
    KEYSETS.every((ks) => FIELDS.filter((f) => ks[f]).every((f) => (
      ks[f].every((c) => BOUND_KEYS.has(c))
    ))));
  for (const c of ['Slash', 'Quote', 'AltRight', 'Space', 'ArrowUp']) {
    ok(`...including ${c}`, BOUND_KEYS.has(c));
  }
  /* ...and nothing the game does NOT bind is swallowed. F5 and F12 are the
     ones that matter: a game that eats reload is a game you have to kill. */
  ok('...and F5 / F12 / Tab are left alone',
    !BOUND_KEYS.has('F5') && !BOUND_KEYS.has('F12') && !BOUND_KEYS.has('Tab'));
}

/* --- and the real manager reads them, which is the half a table cannot prove --- */
console.log('\n--- ...read through the real InputManager ---');
{
  const im = drive([]);
  ok('with no pads, P1 is WASD and P2 the arrow set',
    im.bindings[0].keyset === 0 && im.bindings[1].keyset === 1);

  /** Hold a key, step the manager, and report P2's slot. */
  const press = (...codes) => {
    im.keys.clear();
    for (const c of codes) im.keys.add(c);
    im.update();
    const p = im.players[1];
    return {
      mx: Math.round(p.mx * 100) / 100,
      my: Math.round(p.my * 100) / 100,
      on: ACTIONS.filter((a) => p.down(a)),
    };
  };

  ok('O walks P2 up', press('KeyO').my === -1);
  ok('L walks her down', press('KeyL').my === 1);
  ok('K walks her left', press('KeyK').mx === -1);
  ok('; walks her right', press('Semicolon').mx === 1);
  ok('...and the arrows still do too',
    press('ArrowUp').my === -1 && press('ArrowRight').mx === 1);
  /* Both hand positions at once must not double the stick — it is clamped to a
     circle, and a kid resting a hand on both is a real thing. */
  ok('holding O and Up is still one unit of walk', press('KeyO', 'ArrowUp').my === -1);

  ok('P mounts', press('KeyP').on.join() === 'mount');
  ok('I interacts', press('KeyI').on.join() === 'interact');
  ok('J attacks', press('KeyJ').on.join() === 'attack');
  ok("' sprints", press('Quote').on.join() === 'sprint');
  ok('Right Ctrl jumps too', press('ControlRight').on.join() === 'jump');
  ok('Right Alt jumps', press('AltRight').on.join() === 'jump');
  ok('Right Shift still sprints', press('ShiftRight').on.join() === 'sprint');
  /* The three that MOVED, each asserted to do its new job and only that. */
  ok('/ is attack now, not jump', press('Slash').on.join() === 'attack');
  ok('. is mount now, not attack', press('Period').on.join() === 'mount');
  ok(', is still interact', press('Comma').on.join() === 'interact');
  ok('the numpad is untouched',
    press('Numpad0').on.join() === 'jump' && press('Numpad1').on.join() === 'attack'
    && press('Numpad2').on.join() === 'interact' && press('Numpad3').on.join() === 'mount');

  /* AND NONE OF IT REACHES PLAYER 1. Her hand is on the other side of the
     keyboard; a stray binding that moved both kittens would be the worst
     possible version of this feature. */
  im.keys.clear();
  for (const c of ['KeyO', 'KeyK', 'KeyP', 'KeyI', 'KeyJ', 'Quote', 'AltRight', 'ControlRight']) {
    im.keys.add(c);
  }
  im.update();
  const p1 = im.players[0];
  ok('none of player 2\'s keys move player 1',
    p1.mx === 0 && p1.my === 0 && ACTIONS.every((a) => !p1.down(a)));
  im.keys.clear();
}

/* --- A PARTY OF ONE READS ONE SLOT ---
   A phone boots with one kitten (`device.defaultParty`), and `Game` has to hand
   that number to the input layer at BOOT and not only on join/leave.

   The two numbers used to agree BY ACCIDENT — `partySize` and
   `InputManager.slots` were both the literal 2, so nothing ever had to assign
   it. Once the party came from the device that accident broke, and the symptom
   was invisible on a desktop: a phone booted one kitten with an input layer
   still tracking two, which dealt the ARROW KEYS to a slot no player was
   sitting in and made `joinHint` claim nobody could join. */
console.log('\n--- a party of one ---');
{
  const solo = drive([]);
  solo.slots = 1;
  solo.update();

  ok('the only kitten gets WASD', solo.bindings[0].keyset === 0,
    JSON.stringify(solo.bindings[0]));
  /* THE SLOT PAST THE PARTY READS NOTHING — the rule `_assign` exists to keep.
     Without it the arrows drive a kitten nobody has seated. */
  ok('slot 1 is dealt no device at all',
    solo.bindings[1].keyset === null && solo.bindings[1].pad === null,
    JSON.stringify(solo.bindings[1]));

  solo.keys.add('ArrowUp');
  solo.keys.add('KeyK');
  solo.update();
  ok('...so the arrow keys move nobody',
    solo.players[1].mx === 0 && solo.players[1].my === 0
    && ACTIONS.every((a) => !solo.players[1].down(a)));
  ok('...and they do not reach the only kitten either',
    solo.players[0].mx === 0 && solo.players[0].my === 0);
  solo.keys.clear();
  solo.update();

  /* AND A SECOND PLAYER CAN STILL GET IN, which is the whole point of leaving
     the party at one rather than locking it there — a Bluetooth pad on the
     phone, or a second keyboard set on a tablet. */
  ok('ENTER is offered as the way in for a second player',
    solo.joinHint() === 'ENTER', `${solo.joinHint()}`);
  ok('...and one keyset free means two are seatable', solo.seatable === 2,
    `${solo.seatable}`);

  /* TWO IS UNTOUCHED, stated here because this block is the one that could
     plausibly break it. */
  const duo = drive([]);
  duo.slots = 2;
  duo.update();
  ok('a party of two still deals WASD and the arrows',
    duo.bindings[0].keyset === 0 && duo.bindings[1].keyset === 1);
}

/* --- TOUCH IS A DEVICE, AND IT IS DEALT FIRST ---
   The ordering is the whole point. On a phone the person holding the phone is
   player 1; a Bluetooth pad paired to it seats a SECOND kitten. Appending touch
   after the pads instead would have `_assign` fill slot 0 from the pad and take
   the screen out from under the thumb already playing. */
console.log('\n--- the touch pad as a device ---');
{
  /* A stand-in with the one method the binder uses. The real TouchPad needs a
     DOM, and none of what is asserted here is about the DOM — it is about which
     slot gets which device. */
  const stub = () => ({ read: () => ({ ax: 0, ay: 0, cx: 0, cy: 0, dpad: [0, 0] }) });
  const mkPad = (i) => { const p = DEVICES.ds4Chrome(); p.index = i; return p; };

  const t = drive([]);
  t.attachTouch(stub());
  t.slots = 1;
  t.update();
  ok('the touch player is P1', t.bindings[0].touch === true,
    JSON.stringify(t.bindings[0]));
  /* AND SHE IS NOT ALSO GIVEN WASD. A touch slot is not padless: handing it a
     keyset too would give the girl holding the screen a second invisible
     controller and take the arrows from her sister on a tablet. */
  ok('...and she is not also dealt a keyboard set', t.bindings[0].keyset === null,
    JSON.stringify(t.bindings[0]));
  ok('...and describe names both surfaces',
    t.describe()[0] === 'P1: touch + WASD', JSON.stringify(t.describe()));

  /* THE CASE THE ORDERING EXISTS FOR: a pad paired to the phone. */
  const tp = drive([mkPad(0)]);
  tp.attachTouch(stub());
  tp.slots = 2;
  tp.update();
  ok('a pad on the phone seats P2, not P1',
    tp.bindings[0].touch === true && tp.bindings[1].pad === 0,
    JSON.stringify(tp.bindings.slice(0, 2)));
  ok('...so the pad never steals the touch player\'s seat',
    tp.bindings[0].pad === null);
  /* TOUCH COUNTS TOWARD HOW MANY CAN BE SEATED, or the join screen refuses a
     second kitten the phone could actually carry. Touch + one pad + both
     keysets is a full house of four — which is the real answer for a tablet
     propped up with a controller and a keyboard in front of it. */
  /* TOUCH CONSUMES WASD, so the pool is one keyset smaller than it looks: touch
     + a pad + the ARROWS is three, not four. Counting it as four is what would
     let the join screen offer a seat that has no device behind it. */
  ok('touch, a pad and the arrows seats three', tp.seatable === 3, `${tp.seatable}`);
  const bare = drive([]);
  bare.attachTouch(stub());
  bare.slots = 1;
  bare.update();
  ok('...and touch with just a keyboard seats two', bare.seatable === 2,
    `${bare.seatable}`);
  ok('...which is the touch player and the arrows',
    bare.joinHint() === 'ENTER', `${bare.joinHint()}`);
  /* The touch pad can never be "a spare controller" — there is one screen and
     whoever holds it is already on it. */
  ok('touch is never offered as a spare controller',
    tp.joinHint() !== 'START on a spare controller', `${tp.joinHint()}`);

  /* DETACHING IS GENUINELY NO DEVICE, not a hidden one still reporting — which
     is what makes the "force off" setting honest. */
  const off = drive([]);
  off.attachTouch(stub());
  off.slots = 2;
  off.update();
  off.attachTouch(null);
  off.update();
  ok('detaching gives the keyboard its seats back',
    off.bindings[0].touch === false && off.bindings[0].keyset === 0
    && off.bindings[1].keyset === 1, JSON.stringify(off.bindings.slice(0, 2)));

  /* --- THE TEST MODE MUST NOT MOVE TWO KITTENS WITH ONE KEY ---
     `touchTestKeys` makes the pad read WASD as well as the screen, so a desktop
     can exercise the buttons from a keyboard. Leaving WASD in the pool too meant
     slot 0 read it THROUGH the pad while slot 1 read it directly, and pressing W
     walked both cats. Found by pressing W and watching it happen. */
  const test = drive([]);
  test.attachTouch(stub());
  test.slots = 2;
  test.update();
  ok('the touch pad owns WASD whenever it is up',
    test.bindings[0].touch === true && test.bindings[1].keyset !== 0,
    JSON.stringify(test.bindings.slice(0, 2)));
  ok('...so P2 gets the arrows instead', test.bindings[1].keyset === 1,
    JSON.stringify(test.bindings[1]));
  /* THE BUG ITSELF: JOINING. `_assign` reserved WASD but `_findJoin` did not,
     and a claim beats the dealer — so pressing ENTER handed player 2 the set the
     pad was already reading, and both kittens walked on one key. */
  const join = drive([]);
  join.attachTouch(stub());
  join.slots = 1;
  join.update();
  join.keys.clear(); join.update();
  join.keys.add('Enter'); join.update();
  const cand = join.pendingJoin();
  join.keys.clear();
  ok('ENTER seats player 2 on the ARROWS, not on WASD',
    cand && cand.keyset === 1, JSON.stringify(cand));
  ok('...and touch plus the arrows is two seatable players',
    join.seatable === 2, `${join.seatable}`);

  /* --- ENTER JOINS; IT DOES NOT PAUSE ---
     The pad reads WASD as its second surface, and merging that keyset WHOLESALE
     handed it the keyboard's ENTER as well. Touch is treated as a pad for
     pausing — it has a dedicated corner button that is nothing else — so ENTER
     started opening the pause menu instead of seating player 2. That is exactly
     the bug the one-key-for-join rule exists to prevent, arrived at from the
     other side, and it was reported from a real session.

     `start` is the one action the merge skips. The corner button still reports
     it; it is simply the only thing that does. */
  const ent = drive([]);
  ent.attachTouch({
    read: (o = {}) => {
      const out = { ax: 0, ay: 0, cx: 0, cy: 0, dpad: [0, 0] };
      for (const a of ACTIONS) out[a] = false;
      // The real merge, reproduced: every action except `start`.
      if (o.keyset && o.keys) {
        const on = (f) => (o.keyset[f] ?? []).some((c) => o.keys.has(c));
        for (const a of ACTIONS) if (a !== 'start' && on(a)) out[a] = true;
      }
      return out;
    },
  });
  ent.slots = 1;
  ent.update();
  ent.keys.add('Enter');
  ent.update();
  ok('ENTER does not press START on the touch player',
    ent.players[0].down('start') === false);
  /* And it still means JOIN, which is the whole reason it must not pause. */
  ent.keys.clear(); ent.update();
  ent.keys.add('Enter'); ent.update();
  ok('...it still offers to seat player 2 on the arrows',
    ent.pendingJoin()?.keyset === 1, JSON.stringify(ent.pendingJoin()));
  ent.keys.clear();
  /* WASD ITSELF STILL REACHES THE PAD — the exception is `start` alone, not the
     keyboard merge. */
  ent.keys.add('KeyF'); ent.update();
  ok('...while WASD still drives the pad', ent.players[0].down('attack') === true);
  ent.keys.clear();

  /* THE FIFTH INVARIANT, STATED WHERE THIS BLOCK COULD BREAK IT: with no touch
     pad attached, the dealing is byte-for-byte what it was before touch
     existed. */
  const plain = drive([mkPad(0)]);
  plain.slots = 3;
  plain.update();
  ok('with no touch pad, two players are dealt exactly as before',
    plain.bindings[0].pad === 0 && plain.bindings[1].keyset === 0
    && plain.bindings[2].keyset === 1,
    JSON.stringify(plain.bindings.slice(0, 3)));
}

/* ------------- 12. the button the prompt tells her to press --------------
   The clan prompt over a kitten's head says `[E]  SWEAR TO RUN WITH
   THUNDERPAW`, and the badge has to be the button SHE is holding — four kids
   on four different devices are all being told to press `interact` at once,
   and a prompt naming somebody else's button is worse than no prompt, because
   she will believe it and conclude the game is broken.

   `promptFor` is the only place that answers this, and it answers from the
   live binding: the same `pad`/`half`/`keyset` the action itself is read
   through, so the label cannot name a device the player is not on. The one
   thing it cannot do is check the silk-screening — see the PROMPTS comment in
   input.js on why a PlayStation pad is told to press B. */
{
  console.log('\n--- the prompt names the right button ---');

  const kb = drive([]);
  kb.slots = 2; kb.update();
  ok('P1 on WASD is told to press E', kb.promptFor(0, 'interact') === 'E',
    `${kb.promptFor(0, 'interact')}`);
  ok('...and P2 on the arrows is told something else',
    kb.promptFor(1, 'interact') !== kb.promptFor(0, 'interact'),
    `${kb.promptFor(1, 'interact')}`);
  /* A LETTER IS PREFERRED OVER AN ARROW when a keyset binds both, because a
     letter is a thing you can print inside a badge and read at a glance. */
  ok('...and a keyset that binds a letter shows the letter, not the arrow',
    /^[A-Z0-9]/.test(kb.promptFor(0, 'jump') ?? ''), `${kb.promptFor(0, 'jump')}`);

  const std = drive([DEVICES.ds4Chrome()]);
  std.slots = 1; std.update();
  ok('a standard pad is told to press B', std.promptFor(0, 'interact') === 'B',
    `${std.promptFor(0, 'interact')}`);
  ok('...and its attack is X', std.promptFor(0, 'attack') === 'X');

  /* THE PAD THE GAME IS ACTUALLY PLAYED ON, and the half is the whole point:
     the two girls holding the two halves of one vJoy device press physically
     different buttons for the same action, and a table lookup that forgot
     `half` would tell both of them 'A'. */
  const vj = DEVICES.vjoy();
  /* IT HAS TO PRESS SOMETHING FIRST. vJoy is reported to the browser whether or
     not a Joy-Con is paired, so `InputManager` ignores it until it shows
     activity — a fixture that never presses is a phantom and is correctly not
     dealt a seat. */
  vj.buttons = buttons(38, [2]);
  const other = DEVICES.ds4Chrome();
  other.index = 1;
  const split = drive([vj, other], { padMode: 'split' });
  ok('the left Joy-Con half is told RIGHT', split.promptFor(0, 'interact') === 'RIGHT',
    `${split.promptFor(0, 'interact')}`);
  ok('...and the right half is told A', split.promptFor(1, 'interact') === 'A',
    `${split.promptFor(1, 'interact')}`);
  ok('...which are different buttons for the same action',
    split.promptFor(0, 'interact') !== split.promptFor(1, 'interact'));

  /* AN UNKNOWN PAD SAYS 'ANY', WHICH IS TRUE — the generic profile really does
     read every face button for interact. A prompt that guessed a letter here
     would be the one lie this whole function exists to avoid. */
  const gen = drive([DEVICES.genericUsb()]);
  gen.slots = 1; gen.update();
  ok('an unknown pad is honestly told ANY', gen.promptFor(0, 'interact') === 'ANY',
    `${gen.promptFor(0, 'interact')}`);

  /* AND NO BINDING MEANS NO PROMPT, not a guess and not a crash. `Game`
     hides the callout entirely on null, which is the right answer for a slot
     nobody is sitting in. */
  ok('an unseated slot has nothing to say', kb.promptFor(9, 'interact') === null,
    `${kb.promptFor(9, 'interact')}`);
  ok('...and so does an action a keyset does not bind',
    kb.promptFor(0, 'nonsense') === null, `${kb.promptFor(0, 'nonsense')}`);

  /* EVERY ACTION, EVERY PROFILE, NO HOLES. A missing entry renders as an empty
     badge — `[]  SWEAR TO RUN` — which reads as a rendering bug rather than as
     a missing table row, so it would be found late and blamed on the Label. */
  for (const dev of ['ds4Chrome', 'xbox', 'dualsense', 'genericUsb', 'ds4NoRemap']) {
    const im = drive([DEVICES[dev]()]);
    im.slots = 1; im.update();
    const holes = ACTIONS.filter((a) => !im.promptFor(0, a));
    ok(`${dev}: every action has a glyph`, holes.length === 0, holes.join(' '));
  }
  for (const slot of [0, 1]) {
    const holes = ACTIONS.filter((a) => !split.promptFor(slot, a));
    ok(`vJoy ${slot ? 'right' : 'left'} half: every action has a glyph`,
      holes.length === 0, holes.join(' '));
  }
}

console.log('');
line('checks', String(checks));
line('failures', String(fails));
process.exit(fails ? 1 : 0);
