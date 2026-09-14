const stub = () => new Proxy({}, { get: () => () => stub(), set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => stub(), width:0,height:0,style:{} }), getElementById: () => null, querySelectorAll: () => [] };
globalThis.window = {};
const m = await import('../src/systems/summonscene.js');
const S = m.FINALE_SHOTS ?? m.default?.FINALE_SHOTS;
console.log('exports', Object.keys(m).join(' '));
