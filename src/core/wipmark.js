/* ---------------------------------------------------------------------------
   工事中 UNDER CONSTRUCTION — the one mark for a part of the game that is not
   finished, drawn the same way wherever it is drawn.

   Richard: "let's add warning/construction signs next to the names of the
   parts/islands in the simulator that are currently 'under construction' ...
   preferably an orange icon". Which islands those are is a flag on the
   island's own row (`wip` in dream/islands.js); this file only knows how the
   mark LOOKS, in the three media it is drawn in: a canvas (the 3D signs and
   the corner minimap), SVG (Lionheart's map), and HTML (his card and the Help
   page, which use the `.wip-mark` class in style.css — the same path, as a
   data URI, because the Help page is static HTML and cannot import this).

   A WARNING TRIANGLE, NOT A CONE OR A WORKER. It has to read at 9px on the
   minimap, where anything with a silhouette inside it is an orange smudge;
   the triangle with a bar and a dot is the shape every road sign uses for
   "careful", which is exactly the sentence.
--------------------------------------------------------------------------- */

export const WIP_ORANGE = '#ff9a1f';
export const WIP_INK = '#1c1003';

/** What the mark says, wherever there is room for words. */
export const WIP_TEXT = {
  kanji: '工事中',
  word: 'EXPERIMENTAL',
  line: 'may not work as expected',
  /* The Help page's legend, and what a kitten is told on arrival. */
  explain: 'still being built — try it at your own risk, and don\'t expect it to be finished',
};

/** The triangle in a 24x24 box, as one SVG path: the outline, then the bar and dot cut out. */
export const WIP_PATH = 'M12 2.2c.7 0 1.3.4 1.7 1l9.4 16.6c.8 1.4-.2 3-1.7 3H2.6c-1.6 0-2.5-1.6-1.7-3L10.3 3.2c.4-.6 1-1 1.7-1z';
export const WIP_BANG = 'M10.7 8.4h2.6l-.4 7.2h-1.8z M12 17.2a1.45 1.45 0 1 1 0 2.9a1.45 1.45 0 1 1 0-2.9z';

/**
 * The mark on a 2D canvas, centred on (cx, cy), `s` across. Saves and
 * restores, so a caller's shadow, fill and alignment survive it.
 */
export function drawWip(g, cx, cy, s) {
  /* LINES, NOT Path2D: the same shape as WIP_PATH (a stroked round join is
     its rounded corners), but drawable by the headless canvas world-check
     runs the signs through, which has no Path2D. */
  g.save();
  g.translate(cx - s / 2, cy - s / 2);
  g.scale(s / 24, s / 24);
  g.lineJoin = 'round';
  g.lineWidth = 2.6;
  g.shadowColor = WIP_ORANGE;
  g.shadowBlur = 8;
  g.fillStyle = WIP_ORANGE;
  g.strokeStyle = WIP_ORANGE;
  g.beginPath();
  g.moveTo(12, 3.4); g.lineTo(22, 20.9); g.lineTo(2, 20.9); g.closePath();
  g.fill();
  g.stroke();
  g.shadowBlur = 0;
  g.fillStyle = WIP_INK;
  g.beginPath();
  g.moveTo(10.7, 8.4); g.lineTo(13.3, 8.4); g.lineTo(12.9, 15.6); g.lineTo(11.1, 15.6); g.closePath();
  g.fill();
  g.beginPath();
  g.arc(12, 18.65, 1.45, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

/** The mark as an SVG group, centred on (cx, cy), `s` across — for an SVG that has its own viewBox. */
export function wipSvg(cx, cy, s, cls = 'wip-svg') {
  const k = s / 24;
  return `<g class="${cls}" transform="translate(${cx - s / 2} ${cy - s / 2}) scale(${k})">`
    + `<path d="${WIP_PATH}" fill="${WIP_ORANGE}"/><path d="${WIP_BANG}" fill="${WIP_INK}"/></g>`;
}

/** The mark inline in HTML text: a span the stylesheet draws. */
export const wipHtml = (title = `${WIP_TEXT.word}: ${WIP_TEXT.line}`) =>
  `<span class="wip-mark" title="${title}" aria-label="${title}"></span>`;
