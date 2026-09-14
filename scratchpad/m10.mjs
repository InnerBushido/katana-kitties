import * as THREE from 'three';
const stub = () => new Proxy({}, { get: () => () => stub(), set: () => true });
const el = () => ({ classList:{add(){},remove(){},toggle(){},contains:()=>false}, style:{setProperty(){}}, textContent:'', width:150,height:150, getContext:()=>new Proxy({},{get:()=>()=>({addColorStop(){}}),set:()=>true}) });
globalThis.document = { createElement: () => ({ getContext: () => stub(), width:0,height:0,style:{} }), getElementById: () => el(), querySelectorAll: () => [] };
globalThis.window = {};
const { SummonScene, FINALE_SHOTS } = await import('../src/systems/summonscene.js');
const S = new SummonScene({ scene: null, world: null, audio: null });
S.start('finale', { x:0,y:0,z:0 }, 30, { texture: new THREE.Texture(), contentScale:0.88, pad:0.06, cols:1, rows:1 });
let t = 0; let cur = null; const marks = [];
for (let i=0;i<60*60 && S.active;i++){ S.update(1/60); t += 1/60; if (S._shot !== cur) { marks.push([t.toFixed(2), S._shot?.cue ?? '(no cue)']); cur = S._shot; } }
console.log(marks.map(m=>m.join(' ')).join('\n'));
console.log('total', t.toFixed(2));
