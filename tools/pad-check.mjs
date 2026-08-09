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

const { InputManager, ACTIONS } = await import('../src/core/input.js');

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

/** Run the real update loop over a fixed set of pads. */
function drive(pads, { padMode = 'auto' } = {}) {
  const im = new InputManager();
  im.padMode = padMode;
  globalThis.navigator = { getGamepads: () => pads };
  im.update();   // first pass binds and seeds `prev`
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
  l1: [],
  r1: [],
  share: [],
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
  // alongside a second pad that would otherwise switch auto out of split mode.
  const v = DEVICES.vjoy();
  const p = DEVICES.ds4Chrome();
  p.index = 1;
  const im = drive([v, p], { padMode: 'split' });
  ok('SPLIT still splits the vJoy pad',
    im.bindings[0].half === 'left' && im.bindings[1].half === 'right',
    JSON.stringify(im.bindings));
}

console.log('\n--- vJoy + a PS4 pad together ---');
{
  const v = DEVICES.vjoy();
  const p = DEVICES.ds4Chrome();
  p.index = 1;
  const im = drive([v, p]);
  ok('two live pads means no split', im.bindings[0].half == null);
  ok('P1 <- vJoy, P2 <- PS4',
    im.bindings[0].pad === 0 && im.bindings[1].pad === 1);
  line('  consequence', 'the RIGHT Joy-Con is unreachable in this combination');
}

console.log('\n--- vJoy alone still splits (regression) ---');
{
  const im = drive([DEVICES.vjoy()]);
  ok('P1 <- left half', im.bindings[0].half === 'left');
  ok('P2 <- right half', im.bindings[1].half === 'right');
  ok('both on the same pad', im.bindings[0].pad === im.bindings[1].pad);
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
  const im = drive([DEVICES.vjoy()]);
  ok('the vJoy pad is still remappable', im.beginCapture('left', 'jump') === true);
}

console.log('');
line('checks', String(checks));
line('failures', String(fails));
process.exit(fails ? 1 : 0);
