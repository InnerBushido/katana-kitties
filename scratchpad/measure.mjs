import * as THREE from 'three';
const stub = () => new Proxy({}, { get: () => () => stub(), set: () => true });
globalThis.document = { createElement: () => ({ getContext: () => stub(), width:0, height:0, style:{} }), getElementById: () => null, querySelectorAll: () => [] };
globalThis.window = {};
const { World } = await import('../src/world/world.js');

const world = new World(new THREE.Scene());
const isls = (world.islands ?? []).filter((i) => i.kind !== 'arena');
const R = Math.max(1, ...isls.map((i) => Math.hypot(i.x, i.z) + (i.radius ?? 10)));
const MINI_R = 16;
const K = MINI_R / R;

console.log('islands', isls.length, 'R', R.toFixed(1), 'scaleK', K.toFixed(4), '= 1/' + (1 / K).toFixed(1));
console.log('baseY spread', Math.min(...isls.map(i => i.baseY ?? 0)).toFixed(1), '..', Math.max(...isls.map(i => i.baseY ?? 0)).toFixed(1));

const solids = world.solids ?? [];
const big = solids.filter((s) => s.r >= 1.6);
console.log('solids', solids.length, 'buildings(r>=1.6)', big.length, 'trees(r<1.6)', solids.length - big.length);
const hist = {};
for (const s of solids) { const k = s.r.toFixed(2); hist[k] = (hist[k] ?? 0) + 1; }
console.log('radius histogram', JSON.stringify(Object.entries(hist).sort((a,b)=>+a[0]-+b[0])));
console.log('groves', JSON.stringify((world.groves ?? []).map(g => ({ x: +g.x.toFixed(0), z: +g.z.toFixed(0), r: g.r }))));
console.log('bridge', JSON.stringify(world.bridge));
console.log('landmarks', (world.landmarks ?? []).length, 'roadMask', (world.roadMask ?? []).length);

for (const isl of isls) {
  const inside = (x, z) => Math.hypot(x - isl.x, z - isl.z) <= (isl.radius ?? 10);
  const b = big.filter(s => inside(s.x, s.z)).length;
  const t = solids.filter(s => s.r < 1.6 && inside(s.x, s.z)).length;
  const gr = (world.groves ?? []).filter(g => inside(g.x, g.z)).length;
  const lm = (world.landmarks ?? []).filter(l => inside(l.x, l.z)).length;
  console.log(`  ${String(isl.kind).padEnd(10)} biome=${String(isl.biome).padEnd(9)} r=${(isl.radius??0).toFixed(0).padStart(3)} baseY=${(isl.baseY??0).toFixed(0).padStart(4)}  houses=${String(b).padStart(3)} trees=${String(t).padStart(3)} groves=${gr} marks=${String(lm).padStart(3)}  modelR=${(Math.max(0.6,(isl.radius??10)*K)).toFixed(2)} modelY_far=${((isl.baseY??0)*K*0.62).toFixed(2)}`);
}

console.log('\n--- model sizes ---');
console.log('house r=7.0 -> halfwidth', (7.0*K*0.72).toFixed(3), 'height', (7.0*1.3*K).toFixed(3));
console.log('house r=4.2 -> halfwidth', (4.2*K*0.72).toFixed(3), 'height', (4.2*1.3*K).toFixed(3));
console.log('BR_W span deck width', (MINI_R*0.06).toFixed(3), 'BR_T', (MINI_R*0.012).toFixed(3));
console.log('red bridge len', Math.max(2.0, 18*K).toFixed(3), '(unfloored', (18*K).toFixed(3) + ')', 'width', (MINI_R*0.06*1.3).toFixed(3));
console.log('cane r', (0.16*K).toFixed(4), 'h', (5.5*K).toFixed(3));
console.log('kitten at true scale', (2.9*K).toFixed(3), ' drawn MINI_H 1.0');
