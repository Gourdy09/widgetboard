// Pure layout logic: no DOM, no fetch. Everything here is unit-tested in Node and is what the
// admin editor calls for every drag / resize / edit.
//
// The grid is FIXED (columns x rows) and always fills the screen, so nothing ever scrolls.
// A card is always: layout.json (base template) < card type defaults < the card's own values.
// Every function takes a `ctx`:  { grid, template, getMeta(type), hasType(type) }

export const DEFAULT_GRID = { columns: 12, rows: 6 };
export const SECTIONS = ["title", "subtitle", "main", "footer"];
export const VISIBILITY = ["visible", "hidden", "collapsed"];

/* ---------- helpers ---------- */

const clamp = (n, lo, hi) => Math.min(Math.max(n, lo), hi);
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);

function toInt(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

/* ---------- grid ---------- */

export function normalizeGrid(raw) {
  const g = isObject(raw) ? raw : {};
  return {
    columns: clamp(toInt(g.columns, DEFAULT_GRID.columns), 1, 24),
    rows: clamp(toInt(g.rows, DEFAULT_GRID.rows), 1, 24),
  };
}

/* ---------- size limits ---------- */

// Min/max span for a card type, already squeezed to fit the grid.
export function cardLimits(type, ctx) {
  const size = ctx.getMeta(type).size ?? {};
  const { columns, rows } = ctx.grid;
  const minC = clamp(toInt(size.min?.col_span, 1), 1, columns);
  const minR = clamp(toInt(size.min?.row_span, 1), 1, rows);
  const maxC = clamp(toInt(size.max?.col_span, columns), minC, columns);
  const maxR = clamp(toInt(size.max?.row_span, rows), minR, rows);
  return {
    min: { col_span: minC, row_span: minR },
    max: { col_span: maxC, row_span: maxR },
  };
}

/* ---------- geometry: occupancy grid ---------- */

export function overlaps(a, b) {
  return (
    a.col < b.col + b.col_span &&
    b.col < a.col + a.col_span &&
    a.row < b.row + b.row_span &&
    b.row < a.row + a.row_span
  );
}

export function hasPosition(c) {
  return Number.isInteger(c.col) && Number.isInteger(c.row) && c.col >= 1 && c.row >= 1;
}

const makeOcc = (grid) => Array.from({ length: grid.rows }, () => new Uint8Array(grid.columns));

function mark(occ, c) {
  for (let r = c.row - 1; r < c.row - 1 + c.row_span && r < occ.length; r++) {
    for (let k = c.col - 1; k < c.col - 1 + c.col_span && k < occ[r].length; k++) occ[r][k] = 1;
  }
}

function buildOcc(cards, grid, ignoreId) {
  const occ = makeOcc(grid);
  for (const c of cards) if (c.id !== ignoreId && hasPosition(c)) mark(occ, c);
  return occ;
}

function isFree(occ, grid, col, row, cs, rs) {
  if (col < 1 || row < 1 || col + cs - 1 > grid.columns || row + rs - 1 > grid.rows) return false;
  for (let r = row - 1; r < row - 1 + rs; r++) {
    for (let k = col - 1; k < col - 1 + cs; k++) if (occ[r][k]) return false;
  }
  return true;
}

// Free spot closest to `want` (or the first one, reading left-to-right/top-to-bottom, when there is no preference).
function nearestFree(occ, grid, want, cs, rs) {
  let best = null;
  let bestD = Infinity;
  for (let row = 1; row <= grid.rows - rs + 1; row++) {
    for (let col = 1; col <= grid.columns - cs + 1; col++) {
      if (!isFree(occ, grid, col, row, cs, rs)) continue;
      if (!want) return { col, row };
      const d = Math.abs(col - want.col) + Math.abs(row - want.row);
      if (d < bestD) {
        bestD = d;
        best = { col, row };
      }
    }
  }
  return best;
}

// Sizes to try, biggest first: the wanted size, then smaller and smaller down to the minimum.
function sizeCandidates(size, min) {
  const out = [];
  for (let c = size.col_span; c >= min.col_span; c--) {
    for (let r = size.row_span; r >= min.row_span; r--) out.push([c, r]);
  }
  return out.sort((a, b) => b[0] * b[1] - a[0] * a[1]);
}

function placeOcc(occ, grid, size, min, want, shrink) {
  const sizes = shrink ? sizeCandidates(size, min) : [[size.col_span, size.row_span]];
  for (const [cs, rs] of sizes) {
    const p = nearestFree(occ, grid, want, cs, rs);
    if (p) return { ...p, col_span: cs, row_span: rs };
  }
  return null;
}

/* ---------- geometry helpers for the editor UI ---------- */

// Where would a card of this size land if dropped near `want`? null when there is no room.
export function findPlacement(cards, size, min, grid, { want = null, ignoreId = null, shrink = false } = {}) {
  return placeOcc(buildOcc(cards, grid, ignoreId), grid, size, min, want, shrink);
}

export function rectFits(cards, rect, grid, ignoreId = null) {
  return isFree(buildOcc(cards, grid, ignoreId), grid, rect.col, rect.row, rect.col_span, rect.row_span);
}

// The largest valid size closest to what the user is dragging towards.
export function bestResize(cards, id, targetCols, targetRows, ctx) {
  const cur = cards.find((c) => c.id === id);
  if (!cur) return null;
  const lim = cardLimits(cur.type, ctx);
  const tc = clamp(targetCols, lim.min.col_span, lim.max.col_span);
  const tr = clamp(targetRows, lim.min.row_span, lim.max.row_span);
  const occ = buildOcc(cards, ctx.grid, id);
  let best = { col_span: cur.col_span, row_span: cur.row_span };
  let bestD = Infinity;
  for (let cs = lim.min.col_span; cs <= tc; cs++) {
    for (let rs = lim.min.row_span; rs <= tr; rs++) {
      if (!isFree(occ, ctx.grid, cur.col, cur.row, cs, rs)) continue;
      const d = tc - cs + (tr - rs);
      if (d < bestD) {
        bestD = d;
        best = { col_span: cs, row_span: rs };
      }
    }
  }
  return best;
}

/* ---------- normalization of a single card ---------- */

function normalizeOne(raw, ctx, warnings, label) {
  const { grid, template, getMeta, hasType } = ctx;

  let type = typeof raw.type === "string" ? raw.type : template.type;
  if (!hasType(type)) {
    warnings.push(`${label}: unknown card type "${raw.type}", using "default"`);
    type = "default";
  }
  const meta = getMeta(type);
  const defaults = meta.defaults ?? {};

  // template < type defaults < card values
  const card = { ...structuredClone(template), ...structuredClone(defaults), ...raw, type };
  card.params = {
    ...template.params,
    ...defaults.params,
    ...(isObject(raw.params) ? raw.params : {}),
  };
  card.config = {
    ...template.config,
    ...defaults.config,
    ...(isObject(raw.config) ? raw.config : {}),
  };

  for (const key of ["title", "subtitle", "footer", "apiUrl"]) {
    card[key] = card[key] == null ? "" : String(card[key]);
  }

  for (const s of SECTIONS) {
    const k = `${s}_visibility`;
    if (!VISIBILITY.includes(card.config[k])) card.config[k] = "visible";
  }

  const minRefresh = Math.max(1000, toInt(meta.minRefreshMs, 1000));
  card.refreshMs = Math.max(minRefresh, toInt(card.refreshMs, template.refreshMs ?? 5000));

  // size: default -> clamp to the type's limits
  const lim = cardLimits(type, ctx);
  const def = meta.size?.default ?? lim.min;
  for (const axis of ["col_span", "row_span"]) {
    const wanted = toInt(raw[axis], def[axis]);
    card[axis] = clamp(wanted, lim.min[axis], lim.max[axis]);
    if (raw[axis] != null && card[axis] !== raw[axis]) {
      warnings.push(`${label}: ${axis} ${raw[axis]} adjusted to ${card[axis]} (allowed ${lim.min[axis]}-${lim.max[axis]})`);
    }
  }

  // position: only keep it when both coordinates are valid, otherwise auto-place
  const col = toInt(raw.col, null);
  const row = toInt(raw.row, null);
  if (col >= 1 && row >= 1) {
    card.col = clamp(col, 1, grid.columns - card.col_span + 1);
    card.row = clamp(row, 1, grid.rows - card.row_span + 1);
  } else {
    card.col = null;
    card.row = null;
  }
  return card;
}

/* ---------- whole-layout resolution (used on load and when the grid changes) ---------- */

const byRowCol = (a, b) => a.row - b.row || a.col - b.col;

// Takes whatever is in the file and returns a layout that is guaranteed valid: known types,
// unique ids, sizes within limits, inside the grid, no overlaps. Cards that don't fit are
// moved, then shrunk, and only dropped (reported in `dropped`) when the grid is truly full.
export function resolveLayout(rawCards, ctx) {
  const warnings = [];
  const dropped = [];
  const { grid } = ctx;
  const input = (Array.isArray(rawCards) ? rawCards : []).filter(isObject);
  const cards = input.map((raw, i) => normalizeOne(raw, ctx, warnings, `card #${i + 1}`));

  // unique, positive integer ids
  const seen = new Set();
  let maxId = cards.reduce((m, c) => (Number.isInteger(c.id) && c.id > m ? c.id : m), 0);
  cards.forEach((c, i) => {
    const valid = Number.isInteger(c.id) && c.id > 0;
    if (valid && !seen.has(c.id)) return void seen.add(c.id);
    if (valid) warnings.push(`card #${i + 1}: duplicate id ${c.id}, assigned a new one`);
    c.id = ++maxId;
    seen.add(c.id);
  });

  // cards with a position claim it first (in file order); the rest fill the gaps
  const occ = makeOcc(grid);
  const placed = [];
  const place = (c) => {
    const want = hasPosition(c) ? { col: c.col, row: c.row } : null;
    if (want && isFree(occ, grid, c.col, c.row, c.col_span, c.row_span)) {
      mark(occ, c);
      placed.push(c);
      return;
    }
    const lim = cardLimits(c.type, ctx);
    const p = placeOcc(occ, grid, c, lim.min, want, true);
    if (!p) {
      warnings.push(`card ${c.id}: no room left in the ${grid.columns}x${grid.rows} grid, removed`);
      dropped.push(c);
      return;
    }
    if (want) warnings.push(`card ${c.id}: overlapped another card, moved to col ${p.col}, row ${p.row}`);
    if (p.col_span !== c.col_span || p.row_span !== c.row_span) {
      warnings.push(`card ${c.id}: shrunk to ${p.col_span}x${p.row_span} to fit`);
    }
    Object.assign(c, p);
    mark(occ, c);
    placed.push(c);
  };
  cards.filter(hasPosition).forEach(place);
  cards.filter((c) => !hasPosition(c)).forEach(place);

  return { cards: placed.sort(byRowCol), warnings, dropped };
}

/* ---------- editor operations: each returns { ok, cards, card?, reason?, warnings } ---------- */

const fail = (cards, reason) => ({ ok: false, cards, reason, warnings: [] });

export function nextId(cards) {
  return cards.reduce((m, c) => Math.max(m, c.id), 0) + 1;
}

// Adds a card. If its position is missing or taken it goes to the nearest free spot, shrinking if needed.
export function addCard(cards, partial, ctx) {
  const id = nextId(cards);
  const res = resolveLayout([...cards, { ...partial, id }], ctx);
  const card = res.cards.find((c) => c.id === id);
  if (!card) return fail(cards, "No room left in the grid. Remove a widget or make the grid bigger.");
  return { ok: true, cards: res.cards, card, warnings: res.warnings };
}

export function removeCard(cards, id) {
  return { ok: true, cards: cards.filter((c) => c.id !== id), warnings: [] };
}

// Applies a patch (position, size, type, title, params, config...). Sizes are clamped to the
// type's limits; a change that would overlap another card is rejected, never silently reshuffled.
export function updateCard(cards, id, patch, ctx) {
  const current = cards.find((c) => c.id === id);
  if (!current) return fail(cards, `No card with id ${id}`);

  const typeChanged = patch.type !== undefined && patch.type !== current.type;
  const raw = {
    ...current,
    ...patch,
    id,
    params: typeChanged ? { ...patch.params } : { ...current.params, ...patch.params },
    config: { ...current.config, ...patch.config },
  };

  const warnings = [];
  const next = normalizeOne(raw, ctx, warnings, `card ${id}`);
  next.id = id;
  if (!hasPosition(next)) Object.assign(next, { col: current.col, row: current.row });

  const hit = cards.find((c) => c.id !== id && overlaps(c, next));
  if (hit) return fail(cards, `Would overlap card ${hit.id}`);

  const out = cards.map((c) => (c.id === id ? next : c)).sort(byRowCol);
  return { ok: true, cards: out, card: next, warnings };
}

export const moveCard = (cards, id, col, row, ctx) => updateCard(cards, id, { col, row }, ctx);
export const resizeCard = (cards, id, col_span, row_span, ctx) =>
  updateCard(cards, id, { col_span, row_span }, ctx);

// Change the grid size and reflow. Cards are clamped back inside and collisions are moved; if that still
// leaves some without room, the biggest cards are shrunk one step at a time (never below their minimum)
// until everything fits. `dropped` lists cards that cannot fit even with every card at its minimum.
export function setGrid(cards, rawGrid, ctx) {
  const grid = normalizeGrid({ ...ctx.grid, ...rawGrid });
  const next = { ...ctx, grid };
  const work = cards.map((c) => ({ ...c }));
  let res = resolveLayout(work, next);

  while (res.dropped.length) {
    let victim = null;
    let biggest = -1;
    for (const c of work) {
      const lim = cardLimits(c.type, next);
      if (c.col_span <= lim.min.col_span && c.row_span <= lim.min.row_span) continue;
      const area = c.col_span * c.row_span;
      if (area > biggest) {
        biggest = area;
        victim = { c, lim };
      }
    }
    if (!victim) break;
    const { c, lim } = victim;
    const canCol = c.col_span > lim.min.col_span;
    const canRow = c.row_span > lim.min.row_span;
    if (canCol && (c.col_span >= c.row_span || !canRow)) c.col_span--;
    else c.row_span--;
    res = resolveLayout(work, next);
  }
  return { ok: true, grid, cards: res.cards, dropped: res.dropped, warnings: res.warnings };
}
