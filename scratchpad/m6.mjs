import * as THREE from 'three';
const stub = () => new Proxy({}, { get: () => () => stub(), set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => stub(), width:0, height:0, style:{} }), getElementById: () => null, querySelectorAll: () => [] };
globalThis.window = {};
globalThis.performance ??= { now: () => 0 };
const { World } = await import('../src/world/world.js');
const { FinaleShow } = await import('../src/systems/finaleshow.js');
const world = new World(new THREE.Scene());
const tex = () => ({ texture: new THREE.Texture(), contentScale: 0.88, pad: 0.06, cols: 4, rows: 3 });
const cast = { kittens: [tex(),tex(),tex(),tex()], bless: [tex(),tex(),tex(),tex()], dragon: tex(), satan: tex(), satanCharge: tex(),
  critters: { rat:{calm:tex()}, rabbit:{calm:tex()}, bird:{calm:tex()}, mantis:{calm:tex()} }, panda: tex() };
const S = new FinaleShow(new THREE.Scene());
S.marks = { trioSpots: [] };
S.start(world, cast);
const up = new THREE.Vector3(); const right = new THREE.Vector3();
let mn = 1, mnR = 0;
for (const s of S.slats) {
  up.set(0,1,0).applyQuaternion(s.quat); right.set(1,0,0).applyQuaternion(s.quat);
  mn = Math.min(mn, up.y); mnR = Math.max(mnR, Math.abs(right.y));
}
console.log('slats', S.slats.length, 'min up.y', mn.toFixed(4), '=', (Math.acos(mn)*180/Math.PI).toFixed(1)+'deg pitch', 'max |right.y|', mnR.toExponential(2));
let gmn=1, gmnR=0;
for (const s of S.gates) { up.set(0,1,0).applyQuaternion(s.quat); right.set(1,0,0).applyQuaternion(s.quat); gmn=Math.min(gmn,up.y); gmnR=Math.max(gmnR,Math.abs(right.y)); }
console.log('gates', S.gates.length, 'min up.y', gmn.toFixed(4), '=', (Math.acos(gmn)*180/Math.PI).toFixed(1)+'deg', 'max |right.y|', gmnR.toExponential(2));
console.log('--- per span ---');
const byIsl = new Map();
for (const s of S.slats) { const k = S.isles.indexOf(s.isl); if(!byIsl.has(k)) byIsl.set(k,[]); up.set(0,1,0).applyQuaternion(s.quat); byIsl.get(k).push(Math.acos(up.y)*180/Math.PI); }
for (const [k,v] of byIsl) console.log('isle', k, 'max pitch', Math.max(...v).toFixed(1));
for (const isl of S.isles) console.log('isle r', isl.r.toFixed(2), 'nearY', isl.nearY?.toFixed(2), 'near', isl.near.x.toFixed(2), isl.near.z.toFixed(2), 'parent?', !!isl.parent);
