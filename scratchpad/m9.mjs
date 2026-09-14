const stub = () => new Proxy({}, { get: () => () => stub(), set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => stub(), width:0,height:0,style:{} }), getElementById: () => null, querySelectorAll: () => [] };
globalThis.window = {};
const { FINALE_SHOTS, SCRIPTS } = await import('../src/systems/summonscene.js');
for (const [i, s] of FINALE_SHOTS.entries()) {
  console.log(i, 'beat', s.beat, 'from', typeof s.from === 'number' ? s.from.toFixed(2) : s.from, 'off', s.off ?? 0, 'cue', s.cue, 'keep', !!s.keep);
}
console.log('--- beat durations ---');
SCRIPTS.finale.forEach((b,i)=>console.log(i, (b.dur ?? 7), JSON.stringify(b.text ?? b.line ?? '').slice(0,60)));
