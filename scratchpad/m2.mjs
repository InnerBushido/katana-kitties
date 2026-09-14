import * as THREE from 'three';
const stub = () => new Proxy({}, { get: () => () => stub(), set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => stub(), width:0, height:0, style:{} }), getElementById: () => null, querySelectorAll: () => [] };
globalThis.window = {};
const { World } = await import('../src/world/world.js');
const world = new World(new THREE.Scene());
const s = world.solids;
const small = s.filter(q => q.r < 1.6);
console.log('total', s.length, 'small', small.length, 'withTree', small.filter(q=>q.tree).length);
const h = {};
for (const q of small) { const k = q.r.toFixed(2) + (q.tree ? ' tree' : q.top != null ? ' top' : ''); h[k]=(h[k]??0)+1; }
console.log(JSON.stringify(h, null, 0));
console.log('big', s.filter(q=>q.r>=1.6).length, 'withHouse', s.filter(q=>q.r>=1.6&&q.house).length);
