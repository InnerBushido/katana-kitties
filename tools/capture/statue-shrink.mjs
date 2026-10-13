#!/usr/bin/env node
/**
 * HER STATUE, SHIPPABLE — Tripo's statue cut down to something a browser
 * should download, turned to face the way the bridge needs, and re-skinned as
 * STONE.
 *
 *   node tools/capture/statue-shrink.mjs                  every raw in out/statues-raw/
 *   node tools/capture/statue-shrink.mjs ember --tris 24000 --yaw 90
 *
 * IN:  out/statues-raw/<sheet>.glb — what `tools/statue-bake.mjs` wrote, moved
 *      out of public/ because public/ is copied into dist wholesale and a raw
 *      take is 14MB and ~460k triangles. `out/` is gitignored; the raw takes
 *      were PAID for, so keep them (re-baking costs Tripo credits).
 * OUT: public/models/statues/<sheet>.glb — ~TRIS triangles, a 1024 texture.
 *
 * WHY EACH STEP, since the playtest named three problems at once:
 *   "they face the wrong way" — YAW is a MEASURED number per sheet, read off a
 *     turntable of the raw take in the running game (see docs/notes/housing.md)
 *     and baked into the vertices, so the loader never has to know.
 *   "they don't match the lighting or shaders" — Tripo bakes its own lighting
 *     and full colour into the texture, and the game then lit it again with
 *     toon shading and lerped it toward her colour: a painted kitten, shaded
 *     twice, in the wrong colours. A STATUE is stone. The texture is turned to
 *     warm grey here (its light baked in is kept, softened — that is the
 *     carving's detail) and statue.js tints it lightly toward her colour, the
 *     way the drawn statue's stone carries a sash in it.
 *   "14 MB" — meshoptimizer's attribute-aware simplifier (three ships it, in
 *     examples/jsm/libs, so this adds no dependency), UVs weighted so the
 *     texture seams survive.
 *
 * The GLB is read and written here by hand: one mesh, one primitive, POSITION
 * NORMAL TEXCOORD_0 and indices, one JPEG — which is exactly what Tripo emits.
 * A take that is not that shape is refused, loudly, rather than half-written.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MeshoptSimplifier } from '../../node_modules/three/examples/jsm/libs/meshopt_simplifier.module.js';

/** Degrees to turn each take about +Y so its FRONT faces local +z. MEASURED,
 *  Oct 2026, off a four-side turntable of the raw takes: both came out of
 *  Tripo facing +x. */
export const STATUE_YAW = { ember: -90, frost: -90 };

const P = (p) => new URL(`../../${p}`, import.meta.url);
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const TRIS = +opt('tris', 24000);
const YAW_ARG = opt('yaw', null);
const names = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
const RAW = 'out/statues-raw';
const sheets = names.length ? names
  : (existsSync(P(RAW)) ? readdirSync(P(RAW)).filter((f) => f.endsWith('.glb')).map((f) => f.slice(0, -4)) : []);
if (!sheets.length) { console.log(`nothing in ${RAW}/`); process.exit(0); }

await MeshoptSimplifier.ready;

for (const sheet of sheets) {
  const src = readFileSync(P(`${RAW}/${sheet}.glb`));
  const { json, bin } = readGlb(src);
  if (json.meshes?.length !== 1 || json.meshes[0].primitives.length !== 1 || json.images?.length !== 1) {
    throw new Error(`${sheet}: not the one-mesh, one-image shape Tripo writes — refusing`);
  }
  const prim = json.meshes[0].primitives[0];
  const pos = accessor(json, bin, prim.attributes.POSITION);
  const nrm = prim.attributes.NORMAL != null ? accessor(json, bin, prim.attributes.NORMAL) : null;
  const uv = accessor(json, bin, prim.attributes.TEXCOORD_0);
  const idx = Uint32Array.from(accessor(json, bin, prim.indices));
  const nv = pos.length / 3;

  // --- simplify, holding the UV seams ---
  const target = Math.min(idx.length, TRIS * 3);
  const [out, err] = MeshoptSimplifier.simplifyWithAttributes(
    idx, pos, 3, uv, 2, [0.5, 0.5], null, target, 0.02,
  );
  // --- compact: only the vertices still used, in first-use order ---
  const remap = new Int32Array(nv).fill(-1);
  let n = 0;
  for (const v of out) if (remap[v] < 0) remap[v] = n++;
  const yaw = ((YAW_ARG != null ? +YAW_ARG : STATUE_YAW[sheet] ?? 0) * Math.PI) / 180;
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const P2 = new Float32Array(n * 3), N2 = new Float32Array(n * 3), U2 = new Float32Array(n * 2);
  for (let v = 0; v < nv; v++) {
    const w = remap[v];
    if (w < 0) continue;
    const [x, y, z] = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]];
    P2[w * 3] = x * c + z * s; P2[w * 3 + 1] = y; P2[w * 3 + 2] = -x * s + z * c;
    if (nrm) {
      const [a, b, d] = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
      N2[w * 3] = a * c + d * s; N2[w * 3 + 1] = b; N2[w * 3 + 2] = -a * s + d * c;
    }
    U2[w * 2] = uv[v * 2]; U2[w * 2 + 1] = uv[v * 2 + 1];
  }
  const I2 = n < 65536 ? Uint16Array.from(out, (v) => remap[v]) : Uint32Array.from(out, (v) => remap[v]);
  if (!nrm) smoothNormals(P2, I2, N2);

  // --- the texture, as stone ---
  const img = json.images[0];
  const view = json.bufferViews[img.bufferView];
  const jpg = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
  const stone = toStone(jpg, sheet);

  const glb = writeGlb({ P: P2, N: N2, U: U2, I: I2, jpg: stone });
  mkdirSync(P('public/models/statues'), { recursive: true });
  writeFileSync(P(`public/models/statues/${sheet}.glb`), glb);
  console.log(`${sheet}: ${idx.length / 3} -> ${I2.length / 3} triangles (error ${err.toFixed(4)}), ${n} vertices, `
    + `yaw ${(yaw * 180 / Math.PI).toFixed(0)}deg, texture ${(jpg.length / 1e3).toFixed(0)}KB -> ${(stone.length / 1e3).toFixed(0)}KB, `
    + `${(src.length / 1e6).toFixed(1)}MB -> ${(glb.length / 1e6).toFixed(2)}MB`);
}

/* ------------------------------------------------------------------------ */

function readGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB');
  let o = 12, json = null, bin = null;
  while (o < buf.length) {
    const len = buf.readUInt32LE(o);
    const type = buf.readUInt32LE(o + 4);
    const body = buf.subarray(o + 8, o + 8 + len);
    if (type === 0x4e4f534a) json = JSON.parse(body.toString('utf8'));
    else if (type === 0x004e4942) bin = body;
    o += 8 + len;
  }
  return { json, bin };
}

function accessor(json, bin, i) {
  const A = json.accessors[i];
  const V = json.bufferViews[A.bufferView];
  const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[A.type];
  const T = { 5126: Float32Array, 5125: Uint32Array, 5123: Uint16Array, 5121: Uint8Array }[A.componentType];
  if (!T) throw new Error(`accessor ${i}: component type ${A.componentType}`);
  if (V.byteStride && V.byteStride !== comps * T.BYTES_PER_ELEMENT) throw new Error(`accessor ${i}: interleaved`);
  const off = (V.byteOffset ?? 0) + (A.byteOffset ?? 0);
  const copy = new Uint8Array(A.count * comps * T.BYTES_PER_ELEMENT);
  copy.set(bin.subarray(off, off + copy.length));
  return new T(copy.buffer);
}

function smoothNormals(Pp, I, N) {
  for (let t = 0; t < I.length; t += 3) {
    const [a, b, c] = [I[t] * 3, I[t + 1] * 3, I[t + 2] * 3];
    const ux = Pp[b] - Pp[a], uy = Pp[b + 1] - Pp[a + 1], uz = Pp[b + 2] - Pp[a + 2];
    const vx = Pp[c] - Pp[a], vy = Pp[c + 1] - Pp[a + 1], vz = Pp[c + 2] - Pp[a + 2];
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const k of [a, b, c]) { N[k] += nx; N[k + 1] += ny; N[k + 2] += nz; }
  }
  for (let k = 0; k < N.length; k += 3) {
    const l = Math.hypot(N[k], N[k + 1], N[k + 2]) || 1;
    N[k] /= l; N[k + 1] /= l; N[k + 2] /= l;
  }
}

/**
 * WARM GREY, SOFTENED, 1024. Luminance only (her colours come back as a tint
 * in the game), contrast pulled in so Tripo's baked shadows read as carving
 * and not as a second light, and a sandstone cast so it sits beside the drawn
 * statue's `0xb8b0a4`-ish stone. ffmpeg, because it is already how every other
 * asset in tools/capture is cut.
 */
function toStone(jpg, sheet) {
  const dir = join(tmpdir(), 'kk-statue');
  mkdirSync(dir, { recursive: true });
  const a = join(dir, `${sheet}-in.jpg`), b = join(dir, `${sheet}-stone.jpg`);
  writeFileSync(a, jpg);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', a, '-vf',
    'scale=1024:1024:flags=lanczos,hue=s=0,eq=contrast=0.62:brightness=0.24,colorchannelmixer=rr=1.04:gg=1.0:bb=0.93',
    '-q:v', '4', b]);
  return readFileSync(b);
}

function writeGlb({ P: Pp, N, U, I, jpg }) {
  const parts = [Pp, N, U, I, jpg].map((a) => Buffer.from(a.buffer ? new Uint8Array(a.buffer, a.byteOffset, a.byteLength) : a));
  const views = [];
  let off = 0;
  const chunks = [];
  for (const p of parts) {
    const pad = (4 - (off % 4)) % 4;
    if (pad) { chunks.push(Buffer.alloc(pad)); off += pad; }
    views.push({ buffer: 0, byteOffset: off, byteLength: p.length });
    chunks.push(p);
    off += p.length;
  }
  const binBuf = Buffer.concat(chunks);
  let min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < Pp.length; k += 3) for (let j = 0; j < 3; j++) { min[j] = Math.min(min[j], Pp[k + j]); max[j] = Math.max(max[j], Pp[k + j]); }
  const nv = Pp.length / 3;
  const json = {
    asset: { version: '2.0', generator: 'katana-kitties statue-shrink' },
    scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0, name: 'statue' }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1, TEXCOORD_0: 2 }, indices: 3, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 } }],
    textures: [{ source: 0, sampler: 0 }],
    samplers: [{ magFilter: 9729, minFilter: 9987 }],
    images: [{ bufferView: 4, mimeType: 'image/jpeg' }],
    accessors: [
      { bufferView: 0, componentType: 5126, count: nv, type: 'VEC3', min, max },
      { bufferView: 1, componentType: 5126, count: nv, type: 'VEC3' },
      { bufferView: 2, componentType: 5126, count: nv, type: 'VEC2' },
      { bufferView: 3, componentType: I instanceof Uint16Array ? 5123 : 5125, count: I.length, type: 'SCALAR' },
    ],
    bufferViews: views.map((v, k) => (k === 3 ? { ...v, target: 34963 } : k < 3 ? { ...v, target: 34962 } : v)),
    buffers: [{ byteLength: binBuf.length }],
  };
  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc((4 - (jsonBuf.length % 4)) % 4, 0x20)]);
  const binPad = Buffer.concat([binBuf, Buffer.alloc((4 - (binBuf.length % 4)) % 4)]);
  const head = Buffer.alloc(12);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4);
  head.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binPad.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  return Buffer.concat([head, ch(jsonBuf.length, 0x4e4f534a), jsonBuf, ch(binPad.length, 0x004e4942), binPad]);
}
