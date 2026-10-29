/* ---------------------------------------------------------------------------
   忍 A COURSE'S PLAN, FOR A PERSON TO APPROVE — `node tools/bamboo-plan.mjs
   [course] [--before <git ref>]` writes out/bamboo/plan_<course>.html: the
   course from above with every house, door, ladder, rope, lantern and guard
   named, the ROUTES through it drawn in their own colours, and — with
   `--before` — the same course as it was at that commit beside it, with what
   was wrong with it pointed at.

   bamboo-map.mjs is the designer's view (cones, the solver's crawl, as a
   PNG); this is the one you send. The ground is read off the same `levelOf`
   the game builds, so a plan cannot show a door that is not there. The
   routes and the callouts are annotation (PLANS, below): they are what the
   design says, and world-check's `courseProblems` is what proves her real
   size gets along them.
--------------------------------------------------------------------------- */
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { levelOf, houseWalls, ladderFoot, lanternsOn, pickupsOn, guardsOn, DIFFS, START, GATE } from '../src/systems/dream/bamboolevel.js';
import { COURSES } from '../src/systems/dream/bamboocourses.js';

/* What the drawing cannot know: the ways through, and the milestones on them.
   Points are [a, b] — +a up the course, +b to the right, as the game's camera
   shows it. `old` is the same for the course at `--before`. */
const PLANS = {
  village: {
    view: { a0: -19.5, a1: 24.5, b0: -17, b1: 18 },
    routes: [
      { name: 'THE STREET', col: '#59c3ff', how: 'up the street, into the alley, in through h2’s front door, out of its back door into its yard, across to the square',
        pts: [[-16.5, -0.6], [-9, -0.6], [1.6, -1.5], [2.7, -4.5], [2.7, -6], [8.5, -6.2], [12.5, -6.5], [14.6, -6.5], [17, -3.5], [21.5, 0]] },
      { name: 'THE TRAIL', col: '#7dff9a', how: 'the path cut through the bamboo by the gate, to h1’s ladder; along the first rope over the street to h3’s roof; down its ladder to the back lane; through h4 to the square',
        pts: [[-16.5, -1.6], [-11.5, -1.6], [-11.5, -6.2], [-9.4, -8.3], [-7.4, -7.4], [-7.05, -7], [-4.5, -7], [-1, -6.4], [-1, 6.4], [1, 10], [2, 12.55], [2.2, 13.9], [9.5, 13.9], [9.5, 12], [9.5, 8], [13, 7.5], [16, 7.5], [21.5, 0.4]] },
      { name: 'THE ROOFS', col: '#ffb547', how: 'from h2’s back yard up its NEW ladder; along the NEW rope across the street to h4’s roof; down h4’s ladder into its side yard, which is open to the square now',
        pts: [[14.3, -6.8], [13.05, -9.6], [11, -9.6], [9.5, -6.4], [9.5, 6.4], [12, 10.5], [13.55, 10.5], [16, 9], [21.5, 0.8]] },
      { name: 'THE LANE', col: '#d78bff', how: 'the lane up the right of the street, round the back lane behind h3 and h4, and into the square from the side yard',
        pts: [[-9, 0.6], [-8, 3.5], [-8, 13.6], [14.6, 13.6], [15.6, 9], [17.5, 5], [21.5, 1.2]] },
    ],
    notes: [
      { at: [-11.5, -4], text: 'NEW trail through the bamboo', dx: -14, anchor: 'end' },
      { at: [13.05, -9.6], text: 'NEW ladder on h2', dx: 10 },
      { at: [9.5, -1.5], text: 'NEW rope h2 → h4', dx: 10 },
      { at: [15.5, 9.5], text: 'side yard open to the square', dx: 12 },
    ],
    old: {
      routes: [
        { name: 'THE STREET', col: '#59c3ff', how: 'the same street route',
          pts: [[-16.5, -0.6], [-9, -0.6], [1.6, -1.5], [2.7, -4.5], [2.7, -6], [8.5, -6.2], [12.5, -6.5], [14.6, -6.5], [16.5, -4.5], [21.5, 0]] },
        { name: 'ROPES (broken)', col: '#ff6b6b', dash: true, how: 'h1’s ladder stands in the forest — the only way to it was out of bounds',
          pts: [[-9.5, -2.8], [-9.5, -7], [-7.05, -7], [-4.5, -7], [-1, -6.4], [-1, 6.4], [2.4, 7.5], [6.6, 7.5], [12, 10.5], [13.55, 10.5]] },
      ],
      notes: [
        { at: [-7.05, -7], text: 'h1’s ladder: only reachable out of bounds', dx: -14, anchor: 'end', bad: true },
        { at: [4.5, 7.5], text: 'h3 ↔ h4 rope: pointless, canes stop her', dx: 0, dy: -16, anchor: 'middle', bad: true },
        { at: [14.5, 9.5], text: 'h4’s side door + ladder: a pocket, box in its mouth', dx: 12, bad: true },
        { at: [12.5, -6.5], text: 'every door 1.8 wide for a kitten 1.5 across', dx: 12, bad: true },
      ],
    },
  },
};

const S = 18;
function svgOf(C, plan, routes, notes) {
  const V = plan.view;
  const X = (b) => (b - V.b0) * S;
  const Y = (a) => (V.a1 - a) * S;
  const Wd = (V.b1 - V.b0) * S; const Ht = (V.a1 - V.a0) * S;
  const L = levelOf(C);
  const out = [];
  const g = (s) => out.push(s);
  g(`<svg viewBox="0 0 ${Wd.toFixed(0)} ${Ht.toFixed(0)}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${C.name}, from above">`);
  g(`<rect width="100%" height="100%" fill="#10261a"/>`);
  // The ground, run-length per raster row: walkable, path, trail.
  const step = 0.5;
  for (let a = V.a1 - step / 2; a > V.a0; a -= step) {
    let run = null;
    const flush = () => { if (run) g(`<rect x="${X(run.b0 - step / 2).toFixed(1)}" y="${Y(a + step / 2).toFixed(1)}" width="${((run.b1 - run.b0 + step) * S).toFixed(1)}" height="${(step * S + 0.4).toFixed(1)}" fill="${run.f}"/>`); run = null; };
    for (let b = V.b0 + step / 2; b < V.b1; b += step) {
      const c = L.cell(a, b);
      const f = c < 0 ? null : L.trail?.[c] ? '#3e5a3a' : L.walk[c] ? (L.path[c] ? '#3a4650' : '#2c353d') : null;
      if (run && run.f === f) run.b1 = b;
      else { flush(); if (f) run = { b0: b, b1: b, f }; }
    }
    flush();
  }
  for (const t of L.trailCanes ?? []) g(`<circle cx="${X(t.b).toFixed(1)}" cy="${Y(t.a).toFixed(1)}" r="${(0.25 * S).toFixed(1)}" fill="#5fa86a"/>`);
  // Houses: the roof, the walls with their doors as gaps, the name and roof height.
  for (const H of C.houses ?? []) {
    g(`<rect x="${X(H.b0)}" y="${Y(H.a1)}" width="${(H.b1 - H.b0) * S}" height="${(H.a1 - H.a0) * S}" fill="#4a3f63" fill-opacity="0.55"/>`);
    for (const w of houseWalls(H)) g(`<line x1="${X(w.b0)}" y1="${Y(w.a0)}" x2="${X(w.b1)}" y2="${Y(w.a1)}" stroke="#eef0ff" stroke-width="3"/>`);
    for (const d of H.doors ?? []) {
      const along = d.side === 'a0' || d.side === 'a1';
      const a = along ? H[d.side] : d.at; const b = along ? d.at : H[d.side];
      g(`<text x="${X(b)}" y="${Y(a) + 4}" class="door">door ${d.w ?? ''}</text>`);
    }
    g(`<text x="${X((H.b0 + H.b1) / 2)}" y="${Y((H.a0 + H.a1) / 2) - 2}" class="house">${H.id}</text>`);
    g(`<text x="${X((H.b0 + H.b1) / 2)}" y="${Y((H.a0 + H.a1) / 2) + 13}" class="small">roof ${H.h}</text>`);
    if (H.ladder) {
      const f = ladderFoot(H);
      g(`<rect x="${X(f.b) - 6}" y="${Y(f.a) - 6}" width="12" height="12" fill="#ff9a3c" stroke="#10261a" stroke-width="1.5" transform="rotate(45 ${X(f.b)} ${Y(f.a)})"/>`);
    }
  }
  for (const R of C.ropes ?? []) {
    g(`<line x1="${X(R.from[1])}" y1="${Y(R.from[0])}" x2="${X(R.to[1])}" y2="${Y(R.to[0])}" stroke="#ffe066" stroke-width="3" stroke-dasharray="2 5" stroke-linecap="round"/>`);
  }
  for (const t of C.towers ?? []) g(`<circle cx="${X(t.b)}" cy="${Y(t.a)}" r="${(t.r ?? 1.3) * S}" fill="#6c6f86"/><text x="${X(t.b)}" y="${Y(t.a) + 4}" class="small">tower</text>`);
  for (const b of C.barrels ?? []) g(`<circle cx="${X(b.b)}" cy="${Y(b.a)}" r="${0.6 * S}" fill="#a0642e" stroke="#e0b070" stroke-width="1.5"/>`);
  for (const c of C.crates ?? []) g(`<rect x="${X(c.b) - 0.8 * S}" y="${Y(c.a) - 0.8 * S}" width="${1.6 * S}" height="${1.6 * S}" fill="#c9a877" stroke="#5a4426" stroke-width="1.5"/>`);
  for (const c of C.clumps ?? []) g(`<circle cx="${X(c.b)}" cy="${Y(c.a)}" r="${1.1 * S}" fill="#2f8a45"/>`);
  // Guards: patrols, and where each first stands. Only those at NORMAL and up are marked so.
  for (const G of C.guards ?? []) {
    const r = G.route ?? [];
    if (r.length > 1) g(`<polyline points="${[...r, r[0]].map((p) => `${X(p.b)},${Y(p.a)}`).join(' ')}" fill="none" stroke="#ff5a5a" stroke-width="1.5" stroke-opacity="0.7"/>`);
    const p = r[0];
    if (p) g(`<circle cx="${X(p.b)}" cy="${Y(p.a)}" r="7" fill="${G.kind === 'archer' ? '#c45cff' : '#ff4545'}" stroke="#10261a" stroke-width="1.5"/>${G.minDiff ? `<text x="${X(p.b) + 10}" y="${Y(p.a) + 4}" class="small lft">N+</text>` : ''}`);
  }
  // Routes, then milestones over them.
  routes.forEach((R, k) => {
    const off = (k - (routes.length - 1) / 2) * 2.5;
    g(`<polyline points="${R.pts.map(([a, b]) => `${X(b) + off},${Y(a) + off}`).join(' ')}" fill="none" stroke="${R.col}" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" ${R.dash ? 'stroke-dasharray="8 6"' : ''} opacity="0.9"/>`);
  });
  const lan = new Map();
  for (let n = 0; n < 3; n++) for (const l of lanternsOn(C, n)) { const k = `${l.a},${l.b}`; lan.set(k, { ...l, d: [...(lan.get(k)?.d ?? []), 'ENH'[n]] }); }
  for (const l of lan.values()) g(`<circle cx="${X(l.b)}" cy="${Y(l.a)}" r="8" fill="#ffd23c" stroke="#10261a" stroke-width="2"/><text x="${X(l.b) + 11}" y="${Y(l.a) + 4}" class="tag lft">${l.d.join('')}</text>`);
  for (const q of pickupsOn(C, 0)) g(`<path d="M ${X(q.b)} ${Y(q.a) - 9} L ${X(q.b) + 9} ${Y(q.a)} L ${X(q.b)} ${Y(q.a) + 9} L ${X(q.b) - 9} ${Y(q.a)} Z" fill="#5be3ff" stroke="#10261a" stroke-width="1.5"/>`);
  g(`<circle cx="${X(START.b)}" cy="${Y(START.a)}" r="10" fill="#fff"/><text x="${X(START.b)}" y="${Y(START.a) + 26}" class="tag">START</text>`);
  g(`<rect x="${X(GATE.b - GATE.w / 2)}" y="${Y(GATE.a) - 3}" width="${GATE.w * S}" height="6" fill="#ff2a4a"/>`);
  g(`<circle cx="${X(C.scroll.b)}" cy="${Y(C.scroll.a)}" r="12" fill="#ffc400" stroke="#fff" stroke-width="2"/><text x="${X(C.scroll.b)}" y="${Y(C.scroll.a) - 18}" class="tag">SCROLL</text>`);
  for (const n of notes) {
    const x = X(n.at[1]); const y = Y(n.at[0]);
    const tx = x + (n.dx ?? 10); const ty = y + (n.dy ?? 4);
    g(`<circle cx="${x}" cy="${y}" r="13" fill="none" stroke="${n.bad ? '#ff6b6b' : '#ffffff'}" stroke-width="2"/>`);
    g(`<text x="${tx + (n.anchor === 'end' ? -6 : n.anchor === 'middle' ? 0 : 8)}" y="${ty}" class="note ${n.bad ? 'bad' : ''}" text-anchor="${n.anchor ?? 'start'}">${n.text}</text>`);
  }
  g('</svg>');
  return out.join('\n');
}

const legendRows = [
  ['#2c353d', 'walkable ground', 'sq'], ['#3e5a3a', 'a trail cut through the bamboo', 'sq'], ['#4a3f63', 'a house (its roof; doors are the gaps)', 'sq'],
  ['#ff9a3c', 'a ladder’s foot', 'dia'], ['#ffe066', 'a rope between roofs', 'line'], ['#ffd23c', 'a lantern — the letters say at which difficulties', 'dot'],
  ['#5be3ff', 'a shuriken to pick up', 'dia'], ['#a0642e', 'a barrel to hide in', 'dot'], ['#c9a877', 'a stack (boxes, firewood or rice)', 'sq'],
  ['#ff4545', 'a samurai and his rounds (N+: NORMAL and HARD)', 'dot'], ['#c45cff', 'the archer on the tower', 'dot'],
];

function page(C, plan, before) {
  const rlist = (routes) => routes.map((R) => `<li><span class="sw" style="background:${R.col}"></span><b>${R.name}</b> ${R.how}</li>`).join('');
  const legend = legendRows.map(([c, t, k]) => `<li><span class="key ${k}" style="--c:${c}"></span>${t}</li>`).join('');
  const panel = (title, sub, svg, routes) => `<section class="plan"><header><h2>${title}</h2><p>${sub}</p></header><div class="map">${svg}</div><ol class="routes">${rlist(routes)}</ol></section>`;
  const now = panel('Now', 'Four ways to the scroll. Each one is crossable at a kitten’s real size — world-check walks every door, ladder foot and rope.', svgOf(C, plan, plan.routes, plan.notes), plan.routes);
  const was = before ? panel('Before', 'One working route. The red circles are what was wrong with it.', svgOf(before, plan, plan.old.routes, plan.old.notes), plan.old.routes) : '';
  return `<meta charset="utf-8">
<title>Village Course Plan</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@600;800&family=IBM+Plex+Sans:wght@400;600&display=swap">
<style>
/* Layout: two plans side by side (stacked on a phone), each map a lit night-time board. */
:root { --bg: #f2f4f1; --fg: #18211c; --muted: #56635b; --line: #cdd5cf; --panel: #ffffff;
  --display: 'Shippori Mincho', 'Hiragino Mincho ProN', Georgia, serif; --body: 'IBM Plex Sans', system-ui, sans-serif; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --bg: #0d1511; --fg: #e4ece6; --muted: #93a39a; --line: #26342c; --panel: #131e18; color-scheme: dark } }
:root[data-theme="dark"] { --bg: #0d1511; --fg: #e4ece6; --muted: #93a39a; --line: #26342c; --panel: #131e18; color-scheme: dark }
body { background: var(--bg); color: var(--fg); font: 15px/1.55 var(--body); padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 28px 48px; }
.wrap { max-width: 1320px; margin: 0 auto; display: grid; gap: 28px; }
h1 { font: 800 clamp(28px, 4vw, 44px)/1.1 var(--display); margin: 0; text-wrap: balance; }
h1 span { color: var(--muted); font-weight: 600; }
.lede { max-width: 68ch; margin: 8px 0 0; color: var(--muted); }
.plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 520px), 1fr)); gap: 24px; }
.plan { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 18px; display: grid; gap: 14px; min-width: 0; }
.plan header h2 { font: 800 24px/1.2 var(--display); margin: 0; }
.plan header p { margin: 4px 0 0; color: var(--muted); }
.map { overflow-x: auto; border-radius: 6px; }
.map svg { display: block; width: 100%; min-width: 460px; height: auto; }
.map text { font-family: var(--body); fill: #f4f6ff; text-anchor: middle; paint-order: stroke; stroke: #10261a; stroke-width: 3px; }
.map .house { font: 700 15px var(--display); }
.map .small, .map .door { font-size: 10px; fill: #c9cfe6; }
.map .door { fill: #ffffff; font-size: 9px; }
.map .tag { font-size: 11px; font-weight: 600; letter-spacing: .06em; }
.map .lft { text-anchor: start; }
.map .note { font-size: 12px; font-weight: 600; }
.map .note.bad { fill: #ffb3b3; }
.routes { margin: 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.routes li { display: grid; grid-template-columns: 22px 1fr; column-gap: 8px; }
.routes b { letter-spacing: .05em; font-size: 13px; margin-right: 6px; }
.sw { width: 22px; height: 6px; border-radius: 3px; margin-top: 9px; grid-row: span 2; }
.legend { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr)); gap: 6px 20px; list-style: none; padding: 0; margin: 0; color: var(--muted); font-size: 13px; }
.legend li { display: flex; gap: 10px; align-items: center; }
.key { width: 14px; height: 14px; background: var(--c); flex: none; }
.key.dot { border-radius: 50%; } .key.dia { transform: rotate(45deg) scale(.8); } .key.line { height: 4px; border-radius: 2px; }
.ask { max-width: 75ch; border-left: 3px solid var(--line); padding-left: 14px; color: var(--muted); }
.ask b { color: var(--fg); }
</style>
<div class="wrap">
  <div><h1>村 ${C.name} <span>· course plan</span></h1>
  <p class="lede">From above, up the screen as her camera sees it: the gate is at the bottom, the scroll at the top. Ground, walls, doors and ladders are drawn from the same data the game builds the course from.</p></div>
  <div class="plans">${now}${was}</div>
  <ul class="legend">${legend}</ul>
  <p class="ask"><b>To check:</b> h2’s new ladder is at its top-left corner as the camera sees it, on the wall facing its back yard. The “door” in your note is read as h2’s existing back door onto that yard, 3 units along the same wall and now 2.8 wide. Say if you wanted a second door right at the corner.</p>
</div>`;
}

const want = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'village';
const ref = process.argv.includes('--before') ? process.argv[process.argv.indexOf('--before') + 1] : null;
const C = COURSES.find((c) => c.id === want);
const plan = PLANS[want];
if (!C || !plan) { console.error(`no plan for "${want}" — PLANS has: ${Object.keys(PLANS).join(', ')}`); process.exit(1); }
mkdirSync('out/bamboo', { recursive: true });
let before = null;
if (ref) {
  const src = execFileSync('git', ['show', `${ref}:src/systems/dream/bamboocourses.js`], { encoding: 'utf8' });
  const tmp = `out/bamboo/_courses_${ref.replace(/[^\w]/g, '_')}.mjs`;
  writeFileSync(tmp, src);
  before = (await import(pathToFileURL(tmp).href)).COURSES.find((c) => c.id === want);
}
const file = `out/bamboo/plan_${want}.html`;
writeFileSync(file, page(C, plan, before));
console.log(`→ ${file}${before ? ` (with ${ref} beside it)` : ''}  ${DIFFS.length} difficulties, ${guardsOn(C, 2).length} guards at HARD`);
