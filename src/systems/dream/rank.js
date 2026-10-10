import * as THREE from 'three';
import { SIM, HOLO } from '../../world/simworld.js';
import { CLANS } from '../../world/world.js';
import { ORB_BY_ID } from '../../entities/powerorb.js';
import { MODES } from '../tournament.js';
import { DRILLS as GALLERY_DRILLS } from './gallery.js';
import { dayKey, weekKey } from './progress.js';
import { Kiosk, idleIn, isleSpot, stars3 } from './kiosk.js';

/* ---------------------------------------------------------------------------
   剣士 KENSHI — ranks, the Fighter Card, and the training of the day.

   THE RANK IS THE STARS, AND ONE THING STARS CANNOT BUY. Every drill pays up
   to three; a rank is a line drawn across her total, so it moves the moment a
   star does and never has to be "updated". First Class asks for the Shadow
   too, because a total can be earned an easy star at a time and the final
   exam cannot — so the top rank means she has done the hardest thing in here
   at least once. The thresholds are set against what the islands actually
   pay (`world-check` counts them), not against a round number.

   THE FIGHTER CARD IS RICHARD'S BELEGARTH CARD, in the game's own frame: a
   trading card with her portrait, her name in her colour, her rank, her
   signature move and her stars, in foil that catches the light as she walks
   round it. It is a thing in the world (holo.js says why), and it is drawn
   from `cardFacts`, which is pure — the card cannot say anything the progress
   store does not.

   THE TRAINING OF THE DAY is one island drill, picked by the date, worth one
   bonus star if she clears it today; and one for the week, worth two if she
   three-stars it before Sunday is out. The picks are a hash of `dayKey` and
   `weekKey`, so every machine agrees on today's drill and two sisters on two
   tablets are set the same one. The bonus is written as a star under its own
   id (`daily.<day>`, `weekly.<week>`), so the rank counts it with no second
   rule — and nothing in here is a real-world prize; that is the tenth quest's
   job (feats.js).
--------------------------------------------------------------------------- */

export const RANKS = [
  { id: 'k3', kanji: '剣士', name: 'KENSHI 3rd Class', short: '3RD CLASS', need: 0, colour: HOLO.cyan },
  { id: 'k2', kanji: '剣士', name: 'KENSHI 2nd Class', short: '2ND CLASS', need: 24, colour: HOLO.magenta },
  { id: 'k1', kanji: '剣士', name: 'KENSHI 1st Class', short: '1ST CLASS', need: 60, shadow: true, colour: HOLO.gold },
];
/* THE SHADOW'S DOOR IS OPEN TO EVERYONE. It asked for 2nd Class (24 stars,
   an afternoon) until Richard: "make it that anyone can do the quest." 1st
   Class still needs him beaten, so the ladder still ends at his door. */

/** Where she stands. Pure, on the progress store and her name. */
export function rankOf(progress, name) {
  const stars = progress.total(name);
  const beat = progress.flag(name, 'shadow');
  let k = 0;
  for (let i = 1; i < RANKS.length; i++) {
    if (stars >= RANKS[i].need && (!RANKS[i].shadow || beat)) k = i;
  }
  const next = RANKS[k + 1] ?? null;
  let toNext = null;
  if (next) {
    const more = Math.max(0, next.need - stars);
    /* "on MEDIUM": the flag is `shadowPrize(level).rank`, and EASY does not
       pay it — the old "beat Shadow Lionheart" sent a kitten who had beaten
       EASY back to a fight she had already won. */
    toNext = more > 0 && next.shadow && !beat ? `${more}★ more AND beat Shadow Lionheart on MEDIUM`
      : more > 0 ? `${more}★ more`
        : 'beat Shadow Lionheart on MEDIUM';
  }
  return { rank: RANKS[k], index: k, stars, next, toNext, shadow: beat };
}

export const atLeast = (progress, name, id) => rankOf(progress, name).index >= RANKS.findIndex((r) => r.id === id);

/**
 * Her signature move: the Gallery drill she has the most stars in — those
 * drills are one per Kotodama, so "her move" is an orb she has proved she can
 * use, named the way the orb is. Ties go to the list's order; none yet is her
 * katana, which is the move every kitten has.
 */
export function signatureOf(progress, name) {
  let best = null;
  let bs = 0;
  for (const id of Object.keys(GALLERY_DRILLS)) {
    const s = progress.stars(name, `gallery.${id}`);
    if (s > bs) { bs = s; best = id; }
  }
  const orb = best ? ORB_BY_ID[best] : null;
  return orb ? { id: best, text: `${orb.kanji} ${orb.name}`, stars: bs } : { id: null, text: '刀 Katana', stars: 0 };
}

/* ------------------------- the training of the day ------------------------- */

/** Every drill the day can pick — the islands', with their names on. Katas
 *  are left out: the Kata floor has its own daily and weekly already. */
export function featuredPool() {
  const pool = [];
  for (const id of Object.keys(GALLERY_DRILLS)) {
    const o = ORB_BY_ID[id];
    pool.push({ id: `gallery.${id}`, title: `${o?.kanji ?? ''} ${o?.name ?? id} drill`, isle: 'KOTODAMA GALLERY' });
  }
  for (const c of CLANS) pool.push({ id: `hall.${c.id}`, title: `${c.name} trial`, isle: 'CLAN TRIAL HALL' });
  for (const [id, t] of [['swing', 'ONE SWING'], ['combo', 'COMBO 60'], ['cut', 'CLEAN CUT']]) {
    pool.push({ id: `range.${id}`, title: t, isle: 'TAMESHIGIRI RANGE' });
  }
  for (const n of [1, 2, 3]) pool.push({ id: `sine.L${n}`, title: `Level ${n}`, isle: 'SINE GAUNTLET' });
  pool.push({ id: 'storm', title: 'KUDAMONO STORM', isle: 'KUDAMONO STORM' });
  pool.push({ id: 'sentries', title: 'HOLO-SENTRIES', isle: 'HOLO-SENTRIES' });
  pool.push({ id: 'bamboo', title: 'BAMBOO INFILTRATION', isle: 'BAMBOO INFILTRATION' });
  pool.push({ id: 'school.feast', title: 'THE FEAST', isle: 'ARENA SCHOOL' });
  for (const m of MODES) pool.push({ id: `school.${m.id}`, title: `${m.name} practice`, isle: 'ARENA SCHOOL' });
  return pool;
}

/** FNV-1a, so a date string becomes the same pick on every machine. */
export function hashKey(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Today's pick and this week's. The week's is never today's, so the two
 *  boxes are two things to do. */
export function picksFor(day = dayKey(), week = weekKey()) {
  const pool = featuredPool();
  const d = pool[hashKey(`day:${day}`) % pool.length];
  let w = pool[hashKey(`week:${week}`) % pool.length];
  if (w.id === d.id) w = pool[(pool.indexOf(w) + 1) % pool.length];
  return { day, week, daily: d, weekly: w };
}

/** Days in a row, ending today or yesterday, with the daily done. */
export function streakOf(progress, name, today = new Date()) {
  const has = (dt) => progress.stars(name, `daily.${dayKey(dt)}`) > 0;
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  // Not done YET today does not break a streak that ran to yesterday.
  if (!has(d)) d.setDate(d.getDate() - 1);
  let n = 0;
  while (has(d) && n < 3650) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export const DAILY_STARS = 1;
export const WEEKLY_STARS = 2;

/**
 * A drill result came in: does it clear the day's or the week's box?
 * Returns what it paid, for the toast. Called by `DreamDojo.award`.
 */
export function rotationAward(progress, name, id, stars, picks = picksFor()) {
  const paid = [];
  if (id === picks.daily.id && stars >= 1) {
    const k = `daily.${picks.day}`;
    if (progress.stars(name, k) < DAILY_STARS) {
      progress.award(name, k, DAILY_STARS);
      paid.push({ kind: 'daily', stars: DAILY_STARS });
    }
  }
  if (id === picks.weekly.id && stars >= 3) {
    const k = `weekly.${picks.week}`;
    if (progress.stars(name, k) < WEEKLY_STARS) {
      progress.award(name, k, WEEKLY_STARS);
      paid.push({ kind: 'weekly', stars: WEEKLY_STARS });
    }
  }
  return paid;
}

/* ------------------------------ the card ---------------------------------- */

/** Everything the Fighter Card says, as data. */
export function cardFacts(progress, name, today = new Date()) {
  const r = rankOf(progress, name);
  return {
    name,
    rank: r.rank,
    next: r.next,
    toNext: r.toNext,
    stars: r.stars,
    signature: signatureOf(progress, name),
    streak: streakOf(progress, name, today),
    shadow: r.shadow,
  };
}

const css = (hex) => `#${new THREE.Color(hex).getHexString()}`;

const FOIL_VERT = /* glsl */`
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vN = normalize(mat3(modelMatrix) * normal);
    vV = normalize(cameraPosition - wp.xyz);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
/* THE FOIL. A rainbow band that slides with the angle she sees the card from
   and with time, laid only over what is drawn (the alpha), strongest on the
   frame — so walking round it is what makes it shine, the way a real foil
   card does under a lamp. */
const FOIL_FRAG = /* glsl */`
  uniform sampler2D map;
  uniform float t;
  uniform float show;
  varying vec2 vUv;
  varying vec3 vN;
  varying vec3 vV;
  void main() {
    vec4 c = texture2D(map, vUv);
    float view = dot(vN, vV);
    float band = sin((vUv.x * 1.2 + vUv.y * 0.9) * 8.0 + t * 1.3 + view * 7.0);
    vec3 rain = 0.5 + 0.5 * cos(6.2831 * (vec3(0.0, 0.33, 0.67) + (vUv.x + vUv.y) * 0.6 + t * 0.12 + view * 1.4));
    float edge = step(0.94, max(abs(vUv.x - 0.5), abs(vUv.y - 0.5) * 0.96) * 2.0);
    c.rgb += rain * smoothstep(0.55, 1.0, band) * (0.22 + 0.4 * edge) * c.a;
    gl_FragColor = vec4(c.rgb, c.a * show);
  }
`;

/** The card itself: a canvas, repainted only when the facts change. */
export class FighterCard extends THREE.Object3D {
  constructor({ w = 4.4, px = 115 } = {}) {
    super();
    this.w = w;
    this.h = w * 1.4;
    const cv = document.createElement('canvas');
    cv.width = Math.round(this.w * px);
    cv.height = Math.round(this.h * px);
    this.cv = cv;
    this.g = cv.getContext('2d', { willReadFrequently: true });
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.tex }, t: { value: 0 }, show: { value: 1 } },
      vertexShader: FOIL_VERT, fragmentShader: FOIL_FRAG,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(this.w, this.h), this.mat);
    this.mesh.renderOrder = 22;
    this.add(this.mesh);
    this._key = null;
  }

  /** Paint her card. `art` is her sprite spec, for the portrait. */
  paint(f, colour, art = null) {
    const key = JSON.stringify([f, colour, !!art?.texture?.image]);
    if (key === this._key) return;
    this._key = key;
    const { g, cv } = this;
    const W = cv.width;
    const H = cv.height;
    const rc = f.rank.colour;
    g.clearRect(0, 0, W, H);
    // The body: dark glass, a frame in the rank's colour, a second in hers.
    g.fillStyle = 'rgba(6, 14, 30, 0.92)';
    round(g, 6, 6, W - 12, H - 12, W * 0.06); g.fill();
    g.lineWidth = W * 0.022; g.strokeStyle = css(rc); g.shadowColor = css(rc); g.shadowBlur = 18;
    round(g, 10, 10, W - 20, H - 20, W * 0.055); g.stroke();
    g.shadowBlur = 0;
    g.lineWidth = W * 0.008; g.strokeStyle = colour;
    round(g, W * 0.06, W * 0.06, W * 0.88, H - W * 0.12, W * 0.04); g.stroke();
    // The header: rank.
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillStyle = css(rc);
    g.font = `900 ${W * 0.075}px "Noto Serif JP", serif`;
    // Fitted inside the inner frame: 3RD CLASS at full size ran into it.
    fit(g, `${f.rank.kanji} KENSHI · ${f.rank.short}`, W * 0.8);
    g.fillText(`${f.rank.kanji} KENSHI · ${f.rank.short}`, W / 2, H * 0.085);
    // The portrait window: a grid, and her own drawing on it.
    const px = W * 0.12; const py = H * 0.13; const pw = W * 0.76; const ph = H * 0.42;
    g.save();
    round(g, px, py, pw, ph, W * 0.03); g.clip();
    const grd = g.createLinearGradient(0, py, 0, py + ph);
    grd.addColorStop(0, 'rgba(20, 60, 90, 0.9)'); grd.addColorStop(1, 'rgba(4, 18, 32, 0.9)');
    g.fillStyle = grd; g.fillRect(px, py, pw, ph);
    g.strokeStyle = 'rgba(80, 230, 255, 0.25)'; g.lineWidth = 2;
    for (let x = px; x < px + pw; x += pw / 10) { g.beginPath(); g.moveTo(x, py); g.lineTo(x, py + ph); g.stroke(); }
    for (let y = py; y < py + ph; y += ph / 7) { g.beginPath(); g.moveTo(px, y); g.lineTo(px + pw, y); g.stroke(); }
    const img = art?.texture?.image;
    if (img && img.width) {
      /* CELL (0, 0) OF HER OWN SHEET, read off the sheet's own column and row
         counts — the same numbers her Billboard samples with, so the portrait
         is the drawing she plays as and not a reasoned crop of it. */
      const cols = art.opts?.cols ?? 4;
      const rows = art.opts?.rows ?? 1;
      const cw = img.width / cols; const ch = img.height / rows;
      const s = Math.min(pw / cw, ph / ch) * 0.95;
      g.drawImage(img, 0, 0, cw, ch, px + (pw - cw * s) / 2, py + ph - ch * s, cw * s, ch * s);
    } else {
      g.fillStyle = colour; g.font = `900 ${W * 0.3}px "Noto Serif JP", serif`;
      g.fillText('猫', px + pw / 2, py + ph / 2);
    }
    g.restore();
    // Her name, in her colour.
    g.fillStyle = colour; g.shadowColor = colour; g.shadowBlur = 12;
    g.font = `900 ${W * 0.1}px Nunito, sans-serif`;
    fit(g, f.name.toUpperCase(), W * 0.8);
    g.fillText(f.name.toUpperCase(), W / 2, H * 0.62);
    g.shadowBlur = 0;
    // The stats.
    const row = (label, value, y, col = '#d8fdff') => {
      g.textAlign = 'left'; g.fillStyle = '#7fe8ff'; g.font = `800 ${W * 0.045}px Nunito, sans-serif`;
      g.fillText(label, W * 0.12, y);
      g.textAlign = 'right'; g.fillStyle = col; g.font = `900 ${W * 0.055}px "Noto Serif JP", Nunito, sans-serif`;
      fit(g, value, W * 0.52);
      g.fillText(value, W * 0.88, y);
    };
    row('STARS', `★ ${f.stars}`, H * 0.7, css(HOLO.gold));
    row('SIGNATURE', f.signature.text, H * 0.76);
    row('STREAK', f.streak ? `${f.streak} day${f.streak === 1 ? '' : 's'}` : '—', H * 0.82);
    row('SHADOW', f.shadow ? '影 BEATEN' : 'not yet', H * 0.88, f.shadow ? css(HOLO.gold) : '#8aa');
    g.textAlign = 'center'; g.fillStyle = '#9fefff'; g.font = `700 ${W * 0.038}px Nunito, sans-serif`;
    g.fillText(f.next ? `next: ${f.next.short} — ${f.toNext}` : 'the top rank — well fought!', W / 2, H * 0.94);
    this.tex.needsUpdate = true;
  }
}

function fit(g, text, maxW) {
  const mw = g.measureText(text).width;
  if (mw > maxW) g.font = g.font.replace(/(\d+(\.\d+)?)px/, (m, n) => `${(Number(n) * maxW) / mw}px`);
}

function round(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/* ----------------------------- the two kiosks ------------------------------ */

/** On the school island, by the bridge: her card, and the day's training. */
export const CARD_KIOSK = [-19, -5];
export const TODAY_KIOSK = [-19, 5];

export class Ranks {
  constructor(dream, isle) {
    this.dream = dream;
    this.isle = isle;
    const at = (a, b) => isleSpot(isle, a, b);
    const name = (p) => p.style?.name ?? p.name;
    const P = dream.progress;

    const cq = at(...CARD_KIOSK);
    /* NO TEXT CARD: the Fighter Card IS the card, and hangs where the text
       one would. `near: 0` keeps the kiosk's own panel down. */
    this.cardKiosk = new Kiosk(dream, {
      x: cq.x, z: cq.z, y: isle.y, colour: HOLO.gold, kanji: '剣士', title: 'FIGHTER CARD', near: 0,
      card: () => [],
      prompt: (p, key) => `[${key}]  MY FIGHTER CARD`,
      interact: (p) => {
        const f = cardFacts(P, name(p));
        dream.game.toast?.(`${p.name} — ${f.rank.name}, ${f.stars}★.`
          + (f.next ? ` Next: ${f.next.short}, ${f.toNext}.` : ' The top rank!'), p.index);
        dream.game.sfx?.('menu');
      },
    });
    this.card = new FighterCard();
    this.card.position.set(cq.x, isle.y + 6.2, cq.z);
    this.card.visible = false;
    this.cardShow = 0;
    this.cardFor = null;
    dream.sim.root.add(this.card);

    const tq = at(...TODAY_KIOSK);
    this.todayKiosk = new Kiosk(dream, {
      x: tq.x, z: tq.z, y: isle.y, colour: HOLO.cyan, kanji: '今日', title: 'TODAY',
      card: (p) => {
        const k = picksFor();
        const n = name(p);
        // "HOLO-SENTRIES (HOLO-SENTRIES)" says one thing twice: the island only when it adds something.
        const where = (x) => (x.title === x.isle ? x.title : `${x.title} (${x.isle})`);
        const dDone = P.stars(n, `daily.${k.day}`) > 0;
        const wDone = P.stars(n, `weekly.${k.week}`) > 0;
        const streak = streakOf(P, n);
        return [
          { text: '今日 TODAY\'S TRAINING', size: 1.7, color: HOLO.cyan, glow: true, jp: true },
          { text: `TODAY: ${where(k.daily)}`, size: 1.0 },
          { text: dDone ? `done! +${DAILY_STARS}★` : `clear it today for +${DAILY_STARS}★`, size: 0.95, color: dDone ? HOLO.gold : 0x9fefff },
          { text: `THIS WEEK: ${where(k.weekly)}`, size: 1.0 },
          { text: wDone ? `done! +${WEEKLY_STARS}★` : `get ★★★ on it this week for +${WEEKLY_STARS}★`, size: 0.95, color: wDone ? HOLO.gold : 0x9fefff },
          { text: streak ? `streak: ${streak} day${streak === 1 ? '' : 's'} in a row` : 'a new one every day', size: 0.9, color: HOLO.gold },
        ];
      },
      prompt: (p, key) => `[${key}]  WHERE IS IT?`,
      interact: (p) => {
        const k = picksFor();
        dream.game.toast?.(`${p.name} — today's training is ${k.daily.title}, on the ${k.daily.isle}.`, p.index);
      },
    });
    this.stations = [this.cardKiosk.station, this.todayKiosk.station];
    dream.sim.tickers.push((dt, t) => this.update(dt, t));
  }

  /** A result came in: pay the day's and the week's boxes, and say so. */
  onAward(p, id, stars) {
    const paid = rotationAward(this.dream.progress, p.style?.name ?? p.name, id, stars);
    for (const x of paid) {
      this.dream.game.toast?.(x.kind === 'daily'
        ? `${p.name} cleared TODAY'S TRAINING: +${x.stars}★!`
        : `${p.name} cleared THIS WEEK'S challenge: +${x.stars}★!`, p.index);
    }
    return paid;
  }

  /**
   * SHE JUST MADE KENSHI 1st CLASS: say what it opened. Richard: "Players
   * should get a message about this being unlocked when they reach Kenshi 1st
   * Class." POLLED, not hooked — 1st Class is reached either by a star (any
   * drill's `award`) or by the Shadow's flag (`_won`), and a poll over
   * `atLeast` cannot miss the next way somebody adds. The `secret` flag is
   * the once, and is what feats.js reads to unveil the quest; it is in the
   * save row with the rest of the ledger.
   */
  _watchFirstClass() {
    const P = this.dream.progress;
    for (const p of this.dream.simKittens()) {
      const n = p.style?.name ?? p.name;
      if (P.flag(n, 'secret') || !atLeast(P, n, 'k1')) continue;
      P.setFlag(n, 'secret');
      this.dream.game.sfx?.('victory');
      this.dream.game.toast?.(`${p.name} is KENSHI 1st CLASS! A SECRET is open: 秘 EXTRA HARD Shadow Lionheart, on his island. Beat it for a SPECIAL Kotodama!`, p.index);
      this.dream.holoSay?.(`${p.name} — KENSHI 1st CLASS!\nMy SHADOW has a secret for you now…`, 7);
    }
  }

  update(dt, t = 0) {
    this._watchFirstClass();
    const idle = idleIn(this.dream);
    this.cardKiosk.update(dt, idle);
    this.todayKiosk.update(dt, idle);
    // The card is for the nearest kitten within six units of its pad.
    let near = null;
    let nd = 6;
    for (const p of idle) {
      const d = Math.hypot(p.position.x - SIM.dx - this.cardKiosk.x, p.position.z - SIM.dz - this.cardKiosk.z);
      if (d < nd) { nd = d; near = p; }
    }
    if (near) {
      const n = near.style?.name ?? near.name;
      this.card.paint(cardFacts(this.dream.progress, n), css(near.style?.colour ?? HOLO.cyan), near.spriteSpec);
      this.cardFor = near;
    }
    this.cardShow += ((near ? 1 : 0) - this.cardShow) * Math.min(1, dt * 5);
    this.card.visible = this.cardShow > 0.03;
    this.card.mat.uniforms.show.value = this.cardShow;
    this.card.mat.uniforms.t.value = t;
    // A slow sway, so the foil moves even for a kitten standing still.
    this.card.mesh.rotation.y = Math.sin(t * 0.7) * 0.35;
    this.card.position.y = this.isle.y + 6.2 + Math.sin(t * 1.3) * 0.12;
  }

  faceCamera(camera) {
    this.cardKiosk.faceCamera(camera);
    this.todayKiosk.faceCamera(camera);
    // Turned to the lens about Y, as every card in here is; the sway rides on top.
    _e.setFromQuaternion(camera.quaternion, 'YXZ');
    this.card.rotation.set(0, _e.y, 0);
  }
}

const _e = new THREE.Euler();
export { stars3 };
