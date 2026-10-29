import { ClipSprite } from './ninjasprite.js';

/* ---------------------------------------------------------------------------
   幽 THE GHOST RUN — the best run there has ever been on this course, at this
   level, played back beside her as she runs it. Richard: "Ghost run → Yes,
   also on Sine Gauntlet if not too difficult". It is not difficult because a
   run is only ever four numbers a tenth of a second: where she was on the
   island (a, b), how high, which way she faced, and what she was doing — so
   one recorder and one player serve both games, in the island's own frame.

   WHOSE GHOST: THE FASTEST, whoever she is. A sister's best is the thing
   worth chasing; your own is on the board already. Its name and colour ride
   on it, so "that is Frost's" is said by the picture.

   KEPT IN THIS BROWSER (localStorage, `kk.ghosts.v1`), ONE PER RUN ID, and
   only a run that FINISHED and beat the one kept replaces it. A run is
   10 Hz × 5 Int16s — a two-minute run is 12KB of base64. Every read and
   write is wrapped: a private window or a full disk just has no ghost, and
   nothing else changes (non-negotiable 9's rule: every file degrades).

   DRAWN WITH THE NINJA ATLAS (ninjasprite.js), at a third opacity, so it is
   plainly not a kitten: the crawl when she crawled, the hang on a rope, the
   climb on a ladder, and the throw's first frame — a figure standing — for
   everything else, gliding. Its mode is the fifth number.
--------------------------------------------------------------------------- */

export const GHOST = { hz: 10, key: 'kk.ghosts.v1', opacity: 0.38, max: 3600 };
/** What she was doing, as the fifth number. */
export const GMODE = { stand: 0, sneak: 1, rope: 2, climb: 3, air: 4 };
const CLIP_OF = ['throw', 'sneak', 'rope', 'climb', 'throw'];

function readAll() {
  try {
    const raw = globalThis.localStorage?.getItem(GHOST.key);
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}

function writeAll(all) {
  try { globalThis.localStorage?.setItem(GHOST.key, JSON.stringify(all)); return true; } catch { return false; }
}

/** Five numbers a sample into base64 Int16s: a, b, y in hundredths, facing in thousandths, mode. */
export function packGhost(samples) {
  const n = Math.min(samples.length, GHOST.max);
  const buf = new Int16Array(n * 5);
  const clamp = (v) => Math.max(-32768, Math.min(32767, Math.round(v)));
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    buf[i * 5] = clamp(s[0] * 100);
    buf[i * 5 + 1] = clamp(s[1] * 100);
    buf[i * 5 + 2] = clamp(s[2] * 100);
    buf[i * 5 + 3] = clamp(s[3] * 1000);
    buf[i * 5 + 4] = s[4] | 0;
  }
  const bytes = new Uint8Array(buf.buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return globalThis.btoa ? globalThis.btoa(bin) : Buffer.from(bytes).toString('base64');
}

export function unpackGhost(b64) {
  const bin = globalThis.atob ? globalThis.atob(b64) : Buffer.from(b64, 'base64').toString('binary');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const buf = new Int16Array(bytes.buffer, 0, Math.floor(bytes.length / 2));
  const out = [];
  for (let i = 0; i + 4 < buf.length; i += 5) out.push([buf[i] / 100, buf[i + 1] / 100, buf[i + 2] / 100, buf[i + 3] / 1000, buf[i + 4]]);
  return out;
}

/** The kept ghost for a run id: { name, style, time, samples } or null. */
export function ghostFor(id) {
  const g = readAll()[id];
  if (!g?.data) return null;
  try { return { ...g, samples: unpackGhost(g.data) }; } catch { return null; }
}

/** Keep this run if it beat the kept one. Returns true if it did. */
export function offerGhost(id, run) {
  if (!run?.samples?.length || !Number.isFinite(run.time)) return false;
  const all = readAll();
  if (all[id] && all[id].time <= run.time) return false;
  all[id] = { name: run.name, style: run.style, time: run.time, data: packGhost(run.samples) };
  return writeAll(all);
}

/** Every kept ghost forgotten (the debug panel's wipe). */
export function clearGhosts() { try { globalThis.localStorage?.removeItem(GHOST.key); } catch { /* nothing kept */ } }

/** Samples a run at GHOST.hz. `sample()` returns [a, b, y, facing, mode]. */
export class GhostRecorder {
  constructor() { this.samples = []; this.acc = 0; }
  tick(dt, sample) {
    this.acc += dt;
    if (!this.samples.length) { this.samples.push(sample()); return; }
    while (this.acc >= 1 / GHOST.hz && this.samples.length < GHOST.max) {
      this.acc -= 1 / GHOST.hz;
      this.samples.push(sample());
    }
  }
}

/**
 * The kept ghost, played back. `place(a, b, y)` turns an island point into the
 * layer, and `facing(th)` an island bearing into a Billboard's facing — the
 * island knows its own frame, so the ghost never has to.
 */
export class GhostFigure {
  constructor(parent, ghost, art, height, place, facing) {
    this.g = ghost;
    this.place = place;
    this.toFacing = facing;
    this.fig = null;
    if (art?.texture) {
      this.fig = new ClipSprite(art.texture, art.man, height);
      this.fig.mat.transparent = true;
      this.fig.mat.opacity = GHOST.opacity;
      this.fig.mat.depthWrite = false;
      this.fig.renderOrder = 3;
      parent.add(this.fig);
    }
  }

  /** At run time `t` (seconds since GO). Hidden once the ghost has finished. */
  update(t) {
    if (!this.fig) return;
    const S = this.g.samples;
    const f = t * GHOST.hz;
    const i = Math.floor(f);
    if (i >= S.length - 1) { this.fig.visible = false; return; }
    const u = f - i;
    const p = S[Math.max(0, i)]; const q = S[i + 1];
    const a = p[0] + (q[0] - p[0]) * u; const b = p[1] + (q[1] - p[1]) * u; const y = p[2] + (q[2] - p[2]) * u;
    const w = this.place(a, b, y);
    this.fig.position.set(w.x, w.y, w.z);
    this.fig.facing = this.toFacing(p[3]);
    const moving = Math.hypot(q[0] - p[0], q[1] - p[1]) > 0.02;
    this.fig.setClip(CLIP_OF[p[4]] ?? 'throw', p[4] === GMODE.stand || p[4] === GMODE.air ? 0 : moving ? t : 0);
    this.fig.visible = true;
  }

  faceCamera(camera) { if (this.fig?.visible) this.fig.faceCamera(camera); }

  dispose() { this.fig?.removeFromParent(); this.fig = null; }
}
