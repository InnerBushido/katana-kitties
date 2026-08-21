/* ---------------------------------------------------------------------------
   THE STEAM SHELF, BUILT OUT OF THE GAME'S OWN ART.

   Launched through Steam the game is a non-Steam shortcut, and a non-Steam
   shortcut has no artwork at all: a grey plate with the .exe name on it, and no
   icon on the desktop. Steam will not draw one for you and never has — it only
   ships artwork for real appids.

   So this makes the five images by hand, from `public/sprites/title_art.png`,
   which is the piece the whole UI's palette was taken from. Nothing here is a
   new drawing. That is the point: the shelf should be THE GAME, not a picture
   of a game, and the alternative — a prompt to an image model — would put art
   on the box that is nowhere inside it.

     out/steam/background.png     3840x1240  game detail page
     out/steam/logo.png           1280 wide  overlaid on the background, alpha
     out/steam/cover.png           600x900   library shelf, portrait
     out/steam/wide-cover.png      920x430   Recent Games, Big Picture
     out/steam/icon.png            256x256   alpha, the source for the .ico
     out/steam/katana-kitties.ico  16..256   the desktop shortcut

   It also writes the GAME's own icons, which are not Steam's business but come
   off the same claw and should not be a second drawing:

     public/favicon.png            96x96     the browser tab
     public/icon-192.png, -512     maskable  add-to-home-screen

   Run: node tools/steam-art.mjs
--------------------------------------------------------------------------- */

import { mkdirSync, writeFileSync } from 'node:fs';
import { readPNG, writePNG, writeICO, blobs } from './png.mjs';

const SRC = 'public/sprites/title_art.png';
const OUT = 'out/steam';

/* --- THE ART, MEASURED, NOT REMEMBERED -------------------------------------
   Every number below came off a scan of the actual file, and `check()` at the
   bottom re-derives each one and throws if the art is ever replaced with
   something they no longer describe. House rule 8, applied to a painting
   rather than a sprite sheet: a crop settled by eye is wrong by the time
   somebody re-exports the picture 40px taller. */
const BANNER = { top: 175, bottom: 612 };      // the torn strip and its wordmark
const SIGN = { x0: 934, x1: 1820, y: 1192 };   // the blank board — see healSign
const CLAW = { x0: 1100, x1: 1620, top: 96, bottom: 745 }; // the three red slashes

/* ========================================================================== */
/* pixels                                                                     */
/* ========================================================================== */

const img = (w, h) => ({ w, h, d: new Uint8ClampedArray(w * h * 4) });

/**
 * Separable triangle filter whose support grows with the reduction factor —
 * bilinear when enlarging, a proper area average when shrinking.
 *
 * The shrinks here are severe: 2752 -> 920 for the wide cover is 0.33x, and a
 * plain bilinear at that ratio reads about one source pixel in nine. The brush
 * strokes crawl and the cherry blossom turns to confetti.
 */
function resample(src, rect, dw, dh) {
  const { x = 0, y = 0, w = src.w, h = src.h } = rect;

  const pass = (s, sw, sh, tw, vertical) => {
    const outW = vertical ? sw : tw;
    const t = new Float32Array((vertical ? sw * tw : tw * sh) * 4);
    const scale = tw / (vertical ? sh : sw);
    const support = Math.max(1, 1 / scale);
    const span = vertical ? sh : sw;
    for (let o = 0; o < tw; o++) {
      const centre = (o + 0.5) / scale;
      const lo = Math.max(0, Math.ceil(centre - support - 0.5));
      const hi = Math.min(span - 1, Math.floor(centre + support - 0.5));
      for (let q = 0; q < (vertical ? sw : sh); q++) {
        let r = 0; let g = 0; let b = 0; let a = 0; let sum = 0;
        for (let i = lo; i <= hi; i++) {
          const wgt = 1 - Math.abs((i + 0.5 - centre) / support);
          if (wgt <= 0) continue;
          const si = (vertical ? (i * sw + q) : (q * sw + i)) * 4;
          const al = s[si + 3] * wgt;
          r += s[si] * al; g += s[si + 1] * al; b += s[si + 2] * al;
          a += al; sum += wgt;
        }
        const di = (vertical ? (o * outW + q) : (q * outW + o)) * 4;
        /* Premultiplied through the filter. Without this the transparent side
           of an edge drags its (arbitrary) colour into the visible side, and
           the logo grows a grey halo the moment Steam puts it on a dark page. */
        t[di] = a > 0 ? r / a : 0;
        t[di + 1] = a > 0 ? g / a : 0;
        t[di + 2] = a > 0 ? b / a : 0;
        t[di + 3] = sum > 0 ? a / sum : 0;
      }
    }
    return t;
  };

  const cut = new Float32Array(w * h * 4);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const s = ((y + j) * src.w + (x + i)) * 4;
      const t = (j * w + i) * 4;
      cut[t] = src.d[s]; cut[t + 1] = src.d[s + 1];
      cut[t + 2] = src.d[s + 2]; cut[t + 3] = src.d[s + 3];
    }
  }
  const end = pass(pass(cut, w, h, dw, false), dw, h, dh, true);
  const out = img(dw, dh);
  for (let i = 0; i < out.d.length; i++) out.d[i] = Math.round(end[i]);
  return out;
}

/** Source-over at x,y, honouring the source's own alpha. */
function over(dst, src, x, y, opacity = 1) {
  for (let j = 0; j < src.h; j++) {
    const dy = y + j;
    if (dy < 0 || dy >= dst.h) continue;
    for (let i = 0; i < src.w; i++) {
      const dx = x + i;
      if (dx < 0 || dx >= dst.w) continue;
      const s = (j * src.w + i) * 4;
      const a = (src.d[s + 3] / 255) * opacity;
      if (a <= 0) continue;
      const t = (dy * dst.w + dx) * 4;
      for (let c = 0; c < 3; c++) dst.d[t + c] = src.d[s + c] * a + dst.d[t + c] * (1 - a);
      dst.d[t + 3] = Math.max(dst.d[t + 3], Math.round(a * 255));
    }
  }
}

/** A vertical ink gradient over the bottom `frac` of an image, for legibility. */
function footer(dst, frac, strength) {
  const start = Math.round(dst.h * (1 - frac));
  for (let y = start; y < dst.h; y++) {
    const k = ((y - start) / (dst.h - start)) ** 1.7 * strength;
    for (let x = 0; x < dst.w; x++) {
      const t = (y * dst.w + x) * 4;
      dst.d[t] = dst.d[t] * (1 - k) + 0x1d * k;
      dst.d[t + 1] = dst.d[t + 1] * (1 - k) + 0x12 * k;
      dst.d[t + 2] = dst.d[t + 2] * (1 - k) + 0x16 * k;
    }
  }
}

/* ========================================================================== */
/* the two things the source art has that a Steam image must not              */
/* ========================================================================== */

/**
 * THE BLANK BOARD IS A HOLE IN THE ART, ON PURPOSE. The title screen puts the
 * cat-head menu panel over the bottom middle of this picture, so the picture
 * has a big empty tan board sitting there waiting for it. Every landscape crop
 * wide enough for Steam reaches into it, and out of context it reads as a
 * missing texture.
 *
 * It is painted out by continuing each column downward from just above the
 * board — which for once is the right repair rather than the lazy one, because
 * what the board covers is a flat amber sky between two COLUMNAR cliffs. The
 * streaks a downward smear leaves are the same shape as the rock already drawn
 * either side of it. A flat fill would have erased two cliff faces.
 */
function healSign(src) {
  const { w, d } = src;
  const top = SIGN.y;
  const donor = top - 8;
  for (let x = SIGN.x0; x <= SIGN.x1; x++) {
    /* Average a few donor rows, so one stray outline pixel cannot become a
       full-height stripe. */
    let r = 0; let g = 0; let b = 0;
    for (let k = 0; k < 5; k++) {
      const s = ((donor - k) * w + x) * 4;
      r += d[s]; g += d[s + 1]; b += d[s + 2];
    }
    r /= 5; g /= 5; b /= 5;
    for (let y = top; y < src.h; y++) {
      const t = (y * w + x) * 4;
      /* A slow fade toward the art's own deep amber, so the bottom edge of a
         3840px background does not end in a hard band of streaks. */
      const k = Math.min(1, (y - top) / 300) * 0.18;
      d[t] = r * (1 - k) + 196 * k;
      d[t + 1] = g * (1 - k) + 138 * k;
      d[t + 2] = b * (1 - k) + 74 * k;
      d[t + 3] = 255;
    }
  }
  /* Then soften horizontally, with a radius that GROWS AS IT DESCENDS. This is
     the whole difference between a repair and an obvious one. Near the top the
     blur is nothing, so each cliff carries on downward as the columnar rock it
     already is; a hundred rows lower the streaks have dissolved into the sky,
     which is what the eye expects of anything that far below a cliff edge.
     A constant blur gave either a visible seam or six vertical bars reaching
     the bottom edge of a 3840px picture. */
  const copy = d.slice();
  for (let y = top; y < src.h; y++) {
    const rad = Math.min(14, Math.round((y - top) / 26));
    if (rad < 1) continue;
    for (let x = SIGN.x0; x <= SIGN.x1; x++) {
      const lo = Math.max(SIGN.x0, x - rad);
      const hi = Math.min(SIGN.x1, x + rad);
      let r = 0; let g = 0; let b = 0;
      for (let i = lo; i <= hi; i++) {
        const s = (y * w + i) * 4;
        r += copy[s]; g += copy[s + 1]; b += copy[s + 2];
      }
      const n = hi - lo + 1;
      const t = (y * w + x) * 4;
      d[t] = r / n; d[t + 1] = g / n; d[t + 2] = b / n;
    }
  }
  return src;
}

/**
 * THE WORDMARK, CUT OFF ITS SKY. Steam draws the Logo on top of the Background,
 * so the logo has to be the torn banner and the claw marks and nothing else.
 *
 * The cut is a flood fill inward from the border rather than a colour test on
 * every pixel, because a colour test cannot tell the orange in the sunset from
 * the orange in a claw mark. Reachability can: everything the banner encloses
 * is kept by construction, which is what saves the claws where they cross it.
 */
function cutLogo(src) {
  /* Tall enough for the CLAWS, which are the reason this is not just a crop of
     the banner: they start in the teal sky above it and finish in the sunset
     below, and a wordmark that stops them dead at the paper's edge loses the
     one thing in the picture that is moving. */
  const y0 = CLAW.top - 16;
  const y1 = CLAW.bottom + 16;
  const w = src.w;
  const h = y1 - y0;
  const out = img(w, h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const s = ((y0 + j) * w + i) * 4;
      const t = (j * w + i) * 4;
      out.d[t] = src.d[s]; out.d[t + 1] = src.d[s + 1];
      out.d[t + 2] = src.d[s + 2]; out.d[t + 3] = 255;
    }
  }

  const cream = (r, g, b) => r > 205 && g > 185 && b > 120 && r - b > 18;
  const ink = (r, g, b) => r < 78 && g < 72 && b < 80;
  /* THE WORDMARK IS WHAT IS ON THE PAPER, and the paper's edge is measured per
     COLUMN, not once for the whole band. A single pair of rows will not do it:
     the banner is torn, so its edge rises and falls by sixty pixels across the
     picture — and where it rises, a pagoda roof from the scene behind rises
     with it and comes up INSIDE the band. Dark enough for the ink test,
     touching the cream so it survives the island filter, and the result is a
     smudge in the bottom right corner of an otherwise clean logo.
     Asking each column where its own paper stops removes it exactly. */
  const band0 = BANNER.top - 20 - y0;
  const band1 = BANNER.bottom + 26 - y0;
  const paper = new Int32Array(w * 2);
  for (let x = 0; x < w; x++) {
    let lo = -1; let hi = -1;
    for (let y = band0; y <= band1; y++) {
      const n = (y * w + x) * 4;
      if (cream(out.d[n], out.d[n + 1], out.d[n + 2])) { if (lo < 0) lo = y; hi = y; }
    }
    /* Four rows of slack each way: a brush stroke's tip can sit a pixel or two
       past the torn edge it was painted on, and losing it looks like a chipped
       letter. Four is not enough for a roof. */
    paper[x * 2] = lo < 0 ? band0 : lo - 4;
    paper[x * 2 + 1] = hi < 0 ? band1 : hi + 4;
  }
  const candidate = (x, y) => (y >= paper[x * 2] && y <= paper[x * 2 + 1])
    || (x >= CLAW.x0 && x <= CLAW.x1);
  const keep = (n, x, y) => {
    if (!candidate(x, y)) return false;
    const r = out.d[n * 4]; const g = out.d[n * 4 + 1]; const b = out.d[n * 4 + 2];
    if (cream(r, g, b) || ink(r, g, b)) return true;
    /* And the claw test is on how UNSATURATED the greens are, not on how red
       the reds are. Measured: the slashes run 251,52,49 and the sunset behind
       them runs 225,156,77 — as red as each other, and the sunset is what a
       `r - g > 55` test happily keeps. Green is the channel that separates
       them. Inside the banner none of this matters: the paper encloses the
       claws, so the fill cannot reach them however they are coloured. */
    return r > 170 && g < 115 && b < 115 && r - g > 70;
  };

  const gone = new Uint8Array(w * h);
  const queue = [];
  const push = (x, y) => {
    const n = y * w + x;
    if (gone[n] || keep(n, x, y)) return;
    gone[n] = 1; queue.push(n);
  };
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  for (let q = 0; q < queue.length; q++) {
    const n = queue[q];
    const x = n % w; const y = (n / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  for (let n = 0; n < gone.length; n++) if (gone[n]) out.d[n * 4 + 3] = 0;

  /* THEN THROW AWAY EVERYTHING THAT IS NOT THE WORDMARK ITSELF. Reachability
     answers "is this outside the banner"; it cannot answer "is this part of
     the banner", and the difference showed up as the corner of a pagoda roof
     — dark enough to pass the ink test, inside the crop, connected to nothing
     — floating in the transparency at the bottom right like a smudge on the
     lens. The wordmark is one object: paper, letters and the claws that cross
     it are all touching. Keep the biggest island and nothing else. */
  const parts = blobs(out.d, w, h, (n) => out.d[n * 4 + 3] > 8);
  if (parts.length > 1) {
    const mine = new Uint8Array(w * h);
    const stack = [parts[0].seed];
    mine[parts[0].seed] = 1;
    while (stack.length) {
      const n = stack.pop();
      const x = n % w; const y = (n / w) | 0;
      for (const q of [x > 0 ? n - 1 : -1, x < w - 1 ? n + 1 : -1,
        y > 0 ? n - w : -1, y < h - 1 ? n + w : -1]) {
        if (q < 0 || mine[q] || out.d[q * 4 + 3] <= 8) continue;
        mine[q] = 1; stack.push(q);
      }
    }
    for (let n = 0; n < mine.length; n++) if (!mine[n]) out.d[n * 4 + 3] = 0;
  }

  /* One box blur of the alpha alone. The fill is a hard yes/no and the banner's
     edge is a brush stroke; without this every torn edge is a staircase. */
  const alpha = new Uint8ClampedArray(w * h);
  for (let n = 0; n < alpha.length; n++) alpha[n] = out.d[n * 4 + 3];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      let sum = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) sum += alpha[(y + j) * w + x + i];
      out.d[(y * w + x) * 4 + 3] = sum / 9;
    }
  }
  return trim(out);
}

/** Shrink to the alpha's bounding box, so "scale to 1280 wide" means the art. */
function trim(src) {
  let x0 = src.w; let x1 = -1; let y0 = src.h; let y1 = -1;
  for (let y = 0; y < src.h; y++) {
    for (let x = 0; x < src.w; x++) {
      if (src.d[(y * src.w + x) * 4 + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  const out = img(x1 - x0 + 1, y1 - y0 + 1);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const s = ((y0 + y) * src.w + (x0 + x)) * 4;
      const t = (y * out.w + x) * 4;
      for (let c = 0; c < 4; c++) out.d[t + c] = src.d[s + c];
    }
  }
  return out;
}

/**
 * THE ICON IS THE CLAW, and it is the only element in this painting that
 * survives sixteen pixels. Everything else was tried on a taskbar first: the
 * kittens are two dark specks, the dragon is a smudge, and the cat-head menu
 * panel — the obvious choice, since it is the kids' own drawing — is 600x270,
 * which inside a square is a 16x7 sliver with nothing readable in it.
 *
 * The three slashes are already the game's mark. They are in the wordmark, and
 * `.load-claw` in style.css is the same three bars. Cropped square through
 * their middle they run corner to corner, and they are the one shape here that
 * is a silhouette rather than a scene.
 */
function cutClaw(src) {
  /* Square, over the CLAWS' TOP HALF: their own width, taken from their top
     tips downward. Two reasons, both about 16 pixels. It fills the frame — the
     slashes run corner to corner instead of floating in the middle of it — and
     it keeps every one of them on the teal sky and the cream paper, where they
     are at maximum contrast. Below the banner they cross the sunset, and there
     the bright edge of a slash and the sky behind it converge to within a few
     values of each other; framing that low left sandy crumbs hanging off the
     bottom of each claw where the two could not be told apart. */
  const side = CLAW.x1 - CLAW.x0;
  const x0 = CLAW.x0;
  const y0 = CLAW.top;
  const claw = img(side, side);
  /* MEASURED, BECAUSE THE SUNSET IS THE SAME COLOUR AS THE CLAWS AND ISN'T.
     A slash runs 252,58,46 at the core through 255,125,60 to 255,174,82 at
     the bright edge; the sky beneath the banner runs 220,154,76 and the paper
     runs 254,224,170. The bright edge of a slash and the sky are all but the
     same hue — what separates them is that the slash is at FULL red and the
     sky is not. Every "is it orange" test tried before this one brought half
     the sunset into the icon as a tan bar along the bottom. */
  const lit = (r, g, b) => r > 235 && g < 200 && b < 130;
  /* And the slashes' own dark outline, which is a deep red rather than the
     wordmark's black — otherwise the shapes lose their edge at 16px, which is
     the only size that really matters. */
  const edge = (r, g, b) => r > 55 && r < 200 && g < 75 && b < 75 && r - g > 40;
  for (let y = 0; y < side; y++) {
    for (let x = 0; x < side; x++) {
      const s = ((y0 + y) * src.w + (x0 + x)) * 4;
      const r = src.d[s]; const g = src.d[s + 1]; const b = src.d[s + 2];
      if (!lit(r, g, b) && !edge(r, g, b)) continue;
      const t = (y * side + x) * 4;
      claw.d[t] = r; claw.d[t + 1] = g; claw.d[t + 2] = b; claw.d[t + 3] = 255;
    }
  }
  /* THREE SLASHES AND NOTHING ELSE. The painting speckles blood spatter around
     them, which at icon size is not spatter, it is dirt on the screen. */
  const parts = blobs(claw.d, side, side, (n) => claw.d[n * 4 + 3] > 0);
  if (parts.length) {
    const floor = parts[0].n * 0.06;
    const mine = new Uint8Array(side * side);
    for (const part of parts) {
      if (part.n < floor) continue;
      const stack = [part.seed];
      mine[part.seed] = 1;
      while (stack.length) {
        const n = stack.pop();
        const x = n % side; const y = (n / side) | 0;
        for (const q of [x > 0 ? n - 1 : -1, x < side - 1 ? n + 1 : -1,
          y > 0 ? n - side : -1, y < side - 1 ? n + side : -1]) {
          if (q < 0 || mine[q] || claw.d[q * 4 + 3] === 0) continue;
          mine[q] = 1; stack.push(q);
        }
      }
    }
    for (let n = 0; n < mine.length; n++) if (!mine[n]) claw.d[n * 4 + 3] = 0;
  }
  /* Same alpha-only softening as the wordmark, for the same reason. */
  const alpha = new Uint8ClampedArray(side * side);
  for (let n = 0; n < alpha.length; n++) alpha[n] = claw.d[n * 4 + 3];
  for (let y = 1; y < side - 1; y++) {
    for (let x = 1; x < side - 1; x++) {
      let sum = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) sum += alpha[(y + j) * side + x + i];
      claw.d[(y * side + x) * 4 + 3] = sum / 9;
    }
  }
  return claw;
}

/* ========================================================================== */
/* the measurements, re-derived                                               */
/* ========================================================================== */

function check(raw) {
  const at = (x, y) => {
    const i = (y * raw.w + x) * 4;
    return [raw.d[i], raw.d[i + 1], raw.d[i + 2]];
  };
  const fail = (msg) => { throw new Error(`${SRC}: ${msg} — re-measure the constants in this file`); };

  /* The banner is the only band where cream and ink between them own the row. */
  const cream = (r, g, b) => r > 228 && g > 212 && b > 160 && r - b > 30 && r - b < 115;
  const ink = (r, g, b) => r < 70 && g < 62 && b < 70;
  let lo = -1; let hi = -1;
  for (let y = 0; y < raw.h; y++) {
    let n = 0;
    for (let x = 0; x < raw.w; x += 4) {
      const [r, g, b] = at(x, y);
      if (cream(r, g, b) || ink(r, g, b)) n++;
    }
    if (n / (raw.w / 4) > 0.5) { if (lo < 0) lo = y; hi = y; }
  }
  if (Math.abs(lo - BANNER.top) > 6 || Math.abs(hi - BANNER.bottom) > 6) {
    fail(`banner measures ${lo}..${hi}, not ${BANNER.top}..${BANNER.bottom}`);
  }

  /* The board is a flat fill: 800+ columns holding one tone for 240 rows. */
  const flat = (r, g, b) => Math.abs(r - 224) < 8 && Math.abs(g - 177) < 8 && Math.abs(b - 122) < 9;
  let bx0 = -1; let bx1 = -1;
  for (let x = 0; x < raw.w; x++) {
    let n = 0;
    for (let y = 1260; y < 1500; y++) if (flat(...at(x, y))) n++;
    if (n > 200) { if (bx0 < 0) bx0 = x; bx1 = x; }
  }
  if (bx0 - SIGN.x0 < 4 || SIGN.x1 - bx1 < 4 || bx0 - SIGN.x0 > 40 || SIGN.x1 - bx1 > 40) {
    fail(`the blank board measures ${bx0}..${bx1}; SIGN must sit just outside it`);
  }

  /* The claws are the only strong red the banner rows hold in QUANTITY. Any
     single red pixel is not enough to bound them by: the picture is speckled
     with red spatter dots, and the sunset itself has red in it out at x=2670.
     A column that is red for a quarter of the banner is a slash. */
  let cx0 = raw.w; let cx1 = -1;
  for (let x = 0; x < raw.w; x++) {
    let n = 0;
    for (let y = BANNER.top; y < BANNER.bottom; y++) {
      const [r, g, b] = at(x, y);
      if (r > 175 && r - g > 55 && r - b > 70) n++;
    }
    if (n > 25) { if (x < cx0) cx0 = x; cx1 = x; }
  }
  if (cx0 < CLAW.x0 || cx1 > CLAW.x1) fail(`the claws reach ${cx0}..${cx1}, outside CLAW`);
}

/* ========================================================================== */
/* build                                                                      */
/* ========================================================================== */

const raw = readPNG(SRC);
check(raw);
const art = healSign(readPNG(SRC));
const logo = cutLogo(readPNG(SRC));
const claw = cutClaw(readPNG(SRC));

mkdirSync(OUT, { recursive: true });
const save = (name, im) => {
  writeFileSync(`${OUT}/${name}`, writePNG(im.w, im.h, im.d));
  console.log(`  ${name.padEnd(23)} ${im.w}x${im.h}`);
};

/** Cover-crop: the biggest source rect of the target's shape, around a point. */
function coverRect(target, focusX, focusY, y0 = 0, y1 = art.h) {
  let w = art.w;
  let h = Math.round(w / target);
  if (h > y1 - y0) { h = y1 - y0; w = Math.round(h * target); }
  return {
    x: Math.max(0, Math.min(art.w - w, Math.round(focusX - w / 2))),
    y: Math.max(y0, Math.min(y1 - h, Math.round(focusY - h / 2))),
    w,
    h,
  };
}

console.log(`\nbuilding from ${SRC} (${raw.w}x${raw.h})`);

/* --- background 3840x1240 --------------------------------------------------
   NO WORDMARK IN IT. Steam composites the Logo on top of this one, and a page
   carrying the wordmark twice — once sharp, once scaled and offset behind it —
   is the single most common way a hand-made shelf looks broken. So the crop
   starts below the banner, which is also the widest clean band the art has. */
save('background.png', resample(
  art, coverRect(3840 / 1240, art.w / 2, 0, CLAW.bottom), 3840, 1240,
));

/* --- logo, 1280 wide ------------------------------------------------------- */
save('logo.png', resample(logo, {}, 1280, Math.round(1280 * logo.h / logo.w)));

/* --- cover 600x900 ---------------------------------------------------------
   Portrait, so it cannot hold the sunset AND the banner AND anybody. It holds
   THE TWO KITTENS, on the left cliff with their katanas out — they are what the
   game is, and a shelf thumbnail is about 100px wide on a real library page.
   The wordmark goes across the top, which is the only place a 6:1 logo fits on
   a 2:3 card. */
{
  const cover = resample(art, coverRect(600 / 900, 545, 1090, BANNER.bottom + 10), 600, 900);
  footer(cover, 0.34, 0.5);
  const mark = resample(logo, {}, 556, Math.round(556 * logo.h / logo.w));
  over(cover, mark, 22, 40);
  save('cover.png', cover);
}

/* --- wide cover 920x430 ----------------------------------------------------
   Carries its own wordmark, because nothing is composited over this one. */
{
  /* This one is not composited at all — it is the painting, cropped to shape.
     A 2.14 frame is almost exactly what the art already is, so overlaying the
     wordmark on top of the wordmark that is already in it put two sets of claw
     marks on the same card. The only edit is a gradient at the foot, because
     Big Picture puts a play button there. */
  const h = Math.round(art.w * 430 / 920);
  const wide = resample(art, { x: 0, y: BANNER.top - 14, w: art.w, h }, 920, 430);
  footer(wide, 0.22, 0.5);
  save('wide-cover.png', wide);
}

/* --- icon ------------------------------------------------------------------
   Every size is resampled from the full-resolution claw rather than from the
   256, because an icon that is downscaled twice is soft at exactly the size
   Windows actually shows it at. */
{
  save('icon.png', resample(claw, {}, 256, 256));
  const sizes = [256, 128, 64, 48, 32, 24, 16];
  const entries = sizes.map((s) => {
    const im = resample(claw, {}, s, s);
    return { size: s, png: writePNG(im.w, im.h, im.d) };
  });
  writeFileSync(`${OUT}/katana-kitties.ico`, writeICO(entries));
  console.log(`  katana-kitties.ico      ${sizes.join(', ')}`);
}

/* ========================================================================== */
/* and the game's own icons, which were somebody else's                       */
/* ========================================================================== */

/* `public/favicon.svg` was a purple lightning bolt — a leftover from the tool
   the project was scaffolded with, referenced by the web manifest and by
   nothing else. So the browser tab had no icon at all (index.html never linked
   one) and "add to home screen" on the phone installed a stranger's logo.
   Nobody noticed for a year because nobody looks at their own tab.
   Same claw, since it is now the desktop icon too and one game should have one
   mark. */
{
  /* MASKABLE, so it needs a background and a margin. Android crops a home
     screen icon to whatever shape the launcher likes — a circle, a squircle, a
     rounded square — and guarantees only the middle 80%. A transparent claw
     that reaches the edge comes out with its tips cut off on half of all
     phones. Ink is what `theme_color` and the loading screen already are, so
     the icon matches what appears a quarter-second after you tap it. */
  const INK = [0x1b, 0x14, 0x26];
  const app = (size, inset) => {
    const out = img(size, size);
    for (let i = 0; i < out.d.length; i += 4) {
      out.d[i] = INK[0]; out.d[i + 1] = INK[1]; out.d[i + 2] = INK[2]; out.d[i + 3] = 255;
    }
    const inner = Math.round(size * inset);
    over(out, resample(claw, {}, inner, inner), (size - inner) >> 1, (size - inner) >> 1);
    return out;
  };
  for (const size of [192, 512]) {
    const im = app(size, 0.64);
    writeFileSync(`public/icon-${size}.png`, writePNG(im.w, im.h, im.d));
    console.log(`  public/icon-${size}.png`.padEnd(25) + `${size}x${size}`);
  }
  /* The tab icon keeps its transparency and fills the frame: a favicon is
     never masked, and at 32px every pixel of margin is a pixel of nothing. */
  const fav = resample(claw, {}, 96, 96);
  writeFileSync('public/favicon.png', writePNG(fav.w, fav.h, fav.d));
  console.log('  public/favicon.png       96x96');
}

console.log('');
