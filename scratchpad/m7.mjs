import * as THREE from 'three';
const stub = () => new Proxy({}, { get: () => () => stub(), set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => stub(), width:0, height:0, style:{} }), getElementById: () => null, querySelectorAll: () => [] };
globalThis.window = {};
const { World } = await import('../src/world/world.js');
const { FinaleShow } = await import('../src/systems/finaleshow.js');
const world = new World(new THREE.Scene());
const tex = () => ({ texture: new THREE.Texture(), contentScale: 0.88, pad: 0.06, cols: 4, rows: 3 });
const cast = { kittens:[tex(),tex(),tex(),tex()], bless:[tex(),tex(),tex(),tex()], dragon:tex(), satan:tex(), satanCharge:tex(),
  critters:{rat:{calm:tex()},rabbit:{calm:tex()},bird:{calm:tex()},mantis:{calm:tex()}}, panda:tex() };
const S = new FinaleShow(new THREE.Scene()); S.marks = { trioSpots: [] }; S.start(world, cast);
S.cue('isles-drift');
const p0 = S.isles.map(i => i.g.position.clone());
for (const n of [90, 180, 300]) {
  while (S._frames === undefined) break;
  for (let i=0;i<(n===90?90:n===180?90:120);i++) S.update(1/60,null);
  console.log(n, S.isles.map((i,k)=> i.g.position.distanceTo(p0[k]).toFixed(2)).join(' '));
}
