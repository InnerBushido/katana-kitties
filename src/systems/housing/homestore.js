/* ---------------------------------------------------------------------------
   Where homes are written down.

   HOMES BELONG TO ONE SAVED GAME. They used to outlive a game — one global
   row, `kk.homes.v1`, read at boot whatever was loaded — and Richard played
   that and reversed it, Oct 2026: "Purchased islands and furniture ... should
   be linked to the save file of the game and not be shared between different
   save files or new games." A new game buying nothing found last week's
   castle standing in the sky, and a home-earned boon carried into a stranger's
   tournament.

   So the store is ONE ROW PER PLAY SESSION, `kk.homes.v1:<sessionId>` — the
   same id `savegame.js` stamps into its rows — AND a copy in each game save.
   The row is the between-autosaves safety net (a purchase is written the
   frame it happens; the game save is up to 30s behind); the save's copy is
   what a load brings back. On a load the newer of the two wins (`at`). A new
   game, or RESTART, mints a new session and so starts with an empty store.
   The old global row is never read again.

   REAL TIME LIVES HERE TOO. The bamboo farm, the animals and the koi run on
   the wall clock ("once a week, a few minutes each"), so their timestamps
   are Date.now() and never the game's own clock — a game paused for a week
   must still find the animals hungry.

   THE BANK. A refund for a kitten who is not in the game — a castle sold
   while her sister is offline — waits here under her name and is paid the
   next time she sits down. "Refunds go to each owner's saved player even if
   she is not logged in."

   Pure data in and out, so `world-check` runs the whole of it headless.
--------------------------------------------------------------------------- */

export const HOME_KEY = 'kk.homes.v1';
export const HOME_VERSION = 1;

/** This save session's row. No session (a headless check) is the bare key. */
export function homeKey(session) {
  return session ? `${HOME_KEY}:${session}` : HOME_KEY;
}

/** How many sessions' rows are kept in the browser. The game saves hold their
 *  own copies, so this only bounds the safety nets, never loses a home a save
 *  still has. */
export const HOME_ROWS_KEPT = 8;

export function emptyStore() {
  return { v: HOME_VERSION, at: 0, homes: {}, bank: {}, records: {}, jukebox: {}, boons: {}, dragons: {} };
}

/** A fresh home row: who owns which site, and what is in it. */
export function newHome(site, house, owners, now = Date.now()) {
  return {
    site, house,
    owners: [...owners],
    /** Per-owner "may non-owners come in?" — the castle's rule; one owner is
     *  just the one-entry case. Locked by default: a new house is private
     *  until she says otherwise. */
    open: Object.fromEntries(owners.map((n) => [n, false])),
    /** What each owner put in, for the castle's pooled purchase and refunds. */
    paid: Object.fromEntries(owners.map((n) => [n, 0])),
    rooms: {},
    /** Outdoor things, placed freely: `{ uid, id, x, z, rot }` in the
     *  house's own frame (x right, z toward the bridge). `uid` is a counter
     *  (`H.uid`) so a moved pond keeps its koi. */
    outdoor: [],
    uid: 0,
    chest: [],
    farm: null,
    pen: null,
    koi: null,
    bought: now,
  };
}

export function loadStore(storage = globalThis.localStorage, key = HOME_KEY) {
  try {
    const raw = storage?.getItem(key);
    if (!raw) return emptyStore();
    return normalise(JSON.parse(raw));
  } catch (e) {
    console.warn('[housing] home store unreadable, starting empty', e);
    return emptyStore();
  }
}

export function saveStore(store, storage = globalThis.localStorage, key = HOME_KEY) {
  try {
    store.at = Date.now();
    storage?.setItem(key, JSON.stringify(store));
    pruneRows(storage, key);
    return true;
  } catch (e) {
    console.warn('[housing] could not write homes', e);
    return false;
  }
}

/** Drop the oldest sessions' rows past HOME_ROWS_KEPT. Never `keep`. */
export function pruneRows(storage, keep) {
  try {
    if (!storage || typeof storage.length !== 'number' || !storage.key) return;
    const rows = [];
    for (let k = 0; k < storage.length; k++) {
      const key = storage.key(k);
      if (!key?.startsWith(`${HOME_KEY}:`) || key === keep) continue;
      let at = 0;
      try { at = JSON.parse(storage.getItem(key))?.at ?? 0; } catch { /* unreadable: oldest */ }
      rows.push({ key, at });
    }
    rows.sort((a, b) => b.at - a.at);
    for (const r of rows.slice(HOME_ROWS_KEPT - 1)) storage.removeItem(r.key);
  } catch { /* a full or locked storage keeps what it has */ }
}

/**
 * Anything that is not a well-formed store becomes the nearest one that is.
 * A hand-edited export with a typo must load as "most of it", never throw
 * on the title screen.
 */
export function normalise(s) {
  const out = emptyStore();
  if (!s || typeof s !== 'object') return out;
  out.at = Number.isFinite(s.at) ? s.at : 0;
  for (const [site, h] of Object.entries(s.homes ?? {})) {
    if (!h || typeof h !== 'object' || !Array.isArray(h.owners) || !h.owners.length) continue;
    out.homes[site] = {
      ...newHome(site, String(h.house ?? 'minka'), h.owners.map(String), h.bought ?? 0),
      ...h,
      site,
    };
    migrateYard(out.homes[site]);
  }
  for (const [k, v] of Object.entries(s.bank ?? {})) if (Number.isFinite(v) && v > 0) out.bank[k] = v;
  out.records = s.records && typeof s.records === 'object' ? s.records : {};
  out.jukebox = s.jukebox && typeof s.jukebox === 'object' ? s.jukebox : {};
  /* What each kitten earned at home for her NEXT battle (housing/boons.js). */
  out.boons = s.boons && typeof s.boons === 'object' ? s.boons : {};
  /* Each kitten's dragon (housing/lair.js), by NAME and beside the homes
     rather than inside one: a lair sold or moved, or a whole home sold, must
     never take a dragon with it (non-negotiable 4). A row that is not even
     an object is dropped; a row with a bad field is kept — lair.js reads
     every field with a default, so "most of her" always loads. */
  out.dragons = {};
  for (const [k, d] of Object.entries(s.dragons && typeof s.dragons === 'object' ? s.dragons : {})) {
    if (d && typeof d === 'object') out.dragons[k] = d;
  }
  return out;
}

/**
 * THE OLD PLOTS, as they were laid out until Oct 2026: angle off the front,
 * distance out. Kept ONLY so a home saved then comes back with its pond and
 * its pen where they stood — `migrateYard` turns `yard: { p2: 'koipond' }`
 * into an outdoor row at the same spot. Nothing else reads them.
 */
const LEGACY_PLOTS = {
  p1: [1.05, 30], p2: [1.75, 31], p3: [2.45, 31], p4: [Math.PI, 31],
  p5: [-2.45, 31], p6: [-1.75, 31], p7: [-1.05, 30],
};

/** `yard` (plot → item) into `outdoor` rows, once. Pure; returns H. */
export function migrateYard(H) {
  if (!Array.isArray(H.outdoor)) H.outdoor = [];
  H.uid = Number.isFinite(H.uid) ? H.uid : H.outdoor.reduce((m, q) => Math.max(m, q.uid ?? 0), 0);
  if (H.yard && typeof H.yard === 'object') {
    for (const [plot, id] of Object.entries(H.yard)) {
      const L = LEGACY_PLOTS[plot];
      if (!L || typeof id !== 'string') continue;
      // an angle a off the front (+z) at distance d is (sin a, cos a) * d
      H.uid += 1;
      H.outdoor.push({ uid: H.uid, id, x: +(Math.sin(L[0]) * L[1]).toFixed(2), z: +(Math.cos(L[0]) * L[1]).toFixed(2), rot: L[0] + Math.PI });
    }
  }
  delete H.yard;
  // a row with no uid (hand-edited file) gets one, or koi state cannot find it
  for (const q of H.outdoor) if (!Number.isFinite(q.uid)) { H.uid += 1; q.uid = H.uid; }
  H.outdoor = H.outdoor.filter((q) => q && typeof q.id === 'string' && Number.isFinite(q.x) && Number.isFinite(q.z));
  return H;
}

/** The newer of two stores — the game save's copy against the browser's. */
export function newer(a, b) {
  if (!a) return b;
  if (!b) return a;
  return (b.at ?? 0) > (a.at ?? 0) ? b : a;
}

/** Which home a kitten owns, by name, or null. One each. */
export function homeOf(store, name) {
  for (const h of Object.values(store.homes)) if (h.owners.includes(name)) return h;
  return null;
}

/* ------------------------------ JSON files ------------------------------ */

/** The store as a downloadable file. Browser only. */
export function exportFile(store) {
  const blob = new Blob([JSON.stringify({ kind: 'katana-kitties-homes', ...store }, null, 2)],
    { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `katana-kitties-homes-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

/** Ask for a file and resolve with the store in it, or null. Browser only. */
export function importFile() {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'application/json,.json';
    inp.onchange = async () => {
      const f = inp.files?.[0];
      if (!f) { resolve(null); return; }
      try {
        const j = JSON.parse(await f.text());
        if (j?.kind !== 'katana-kitties-homes') { resolve(null); return; }
        resolve(normalise(j));
      } catch {
        resolve(null);
      }
    };
    inp.click();
  });
}
