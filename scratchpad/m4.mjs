import * as THREE from 'three';
const stub = () => new Proxy({}, { get: () => () => stub(), set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => stub(), width:0, height:0, style:{} }), getElementById: () => null, querySelectorAll: () => [] };
globalThis.window = {};
const { World } = await import('../src/world/world.js');
const world = new World(new THREE.Scene());
const isls = (world.islands ?? []).filter(i => i.kind !== 'arena');
for (const isl of isls) {
  const inside = (x,z) => Math.hypot(x-isl.x, z-isl.z) <= (isl.radius ?? 10);
  const S = world.solids.filter(q => inside(q.x,q.z));
  const P = (world.props ?? []).filter(p => p.home && inside(p.home.x, p.home.z));
  console.log(`${String(isl.kind).padEnd(10)} biome=${String(isl.biome).padEnd(9)} r=${(isl.radius??0).toFixed(0).padStart(3)} | house=${S.filter(q=>q.house).length} bigNoSpec=${S.filter(q=>q.r>=1.6&&!q.house).length} tree=${S.filter(q=>q.tree).length} smallNoSpec=${S.filter(q=>q.r<1.6&&!q.tree).length} bamboo=${P.filter(p=>p.kind==='bamboo').length} props=${P.length}`);
}
