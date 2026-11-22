import { getCardMeta, hasCardType } from "../cards/index.js";
import { loadCardTemplate } from "../utils/cardFactory.js";
import * as engine from "./layoutEngine.js";
import { normalizeTheme, presetTheme } from "./theme.js";

// The single source of truth for { grid, theme, cards }. No rendering happens here:
// the wall's Dashboard renders from it and the admin editor edits it.
//
// Every mutation returns { ok, reason?, ... } and fires a "change" event ({ detail: { reason, doc } })
// only when something actually changed.
export class LayoutStore extends EventTarget {
  #ctx;
  #cards = [];
  #theme = presetTheme();

  constructor(template) {
    super();
    this.#ctx = { grid: engine.normalizeGrid(), template, getMeta: getCardMeta, hasType: hasCardType };
  }

  static async create() {
    return new LayoutStore(await loadCardTemplate());
  }

  get grid() { return { ...this.#ctx.grid }; }
  get theme() { return structuredClone(this.#theme); }
  get cards() { return structuredClone(this.#cards); }
  card(id) { return this.#cards.find((c) => c.id === id) && structuredClone(this.#cards.find((c) => c.id === id)); }
  limitsFor(type) { return engine.cardLimits(type, this.#ctx); }

  toJSON() {
    return { version: 1, grid: this.grid, theme: this.theme, cards: this.cards };
  }

  // Load a whole document. Invalid content is repaired, not rejected.
  load(doc) {
    this.#ctx.grid = engine.normalizeGrid(doc?.grid);
    this.#theme = normalizeTheme(doc?.theme);
    const { cards, warnings } = engine.resolveLayout(doc?.cards, this.#ctx);
    warnings.forEach((w) => console.warn(`[layout] ${w}`));
    this.#cards = cards;
    this.#emit("load");
    return warnings;
  }

  add(partial) { return this.#apply("add", engine.addCard(this.#cards, partial, this.#ctx)); }
  remove(id) { return this.#apply("remove", engine.removeCard(this.#cards, id)); }
  update(id, patch) { return this.#apply("update", engine.updateCard(this.#cards, id, patch, this.#ctx)); }
  move(id, col, row) { return this.#apply("move", engine.moveCard(this.#cards, id, col, row, this.#ctx)); }
  resize(id, colSpan, rowSpan) { return this.#apply("resize", engine.resizeCard(this.#cards, id, colSpan, rowSpan, this.#ctx)); }

  // Resize the grid. Cards that cannot fit even after shrinking would be removed, so that needs force: true.
  setGrid(partial, { force = false } = {}) {
    const res = engine.setGrid(this.#cards, partial, this.#ctx);
    if (res.dropped.length && !force) {
      return { ok: false, needsConfirm: true, dropped: res.dropped.map((c) => c.id), reason: `${res.dropped.length} widget(s) would no longer fit` };
    }
    this.#ctx.grid = res.grid;
    this.#cards = res.cards;
    this.#emit("grid");
    return { ok: true, dropped: res.dropped.map((c) => c.id) };
  }

  // Deep-merge a partial theme ({ colors: { accent } }, { spacing: { gap } }, or { preset } to reset to a preset).
  setTheme(patch) {
    const next = patch.preset && patch.preset !== this.#theme.preset && !patch.colors
      ? presetTheme(patch.preset)
      : {
          ...this.#theme,
          ...patch,
          colors: { ...this.#theme.colors, ...patch.colors },
          spacing: { ...this.#theme.spacing, ...patch.spacing },
          typography: { ...this.#theme.typography, ...patch.typography },
          effects: { ...this.#theme.effects, ...patch.effects },
        };
    this.#theme = normalizeTheme(next);
    this.#emit("theme");
    return { ok: true, theme: this.theme };
  }

  /* ---- placement helpers for drag and drop ---- */

  // Where a brand-new card of `type` would land if dropped near `want` ({col,row}); null = no room.
  placeNew(type, want = null) {
    const meta = getCardMeta(type);
    const lim = this.limitsFor(type);
    const size = meta.size?.default ?? lim.min;
    const clamped = {
      col_span: Math.min(Math.max(size.col_span, lim.min.col_span), lim.max.col_span),
      row_span: Math.min(Math.max(size.row_span, lim.min.row_span), lim.max.row_span),
    };
    return engine.findPlacement(this.#cards, clamped, lim.min, this.#ctx.grid, { want, shrink: true });
  }

  // Where an existing card lands if dragged near `want`; null = nowhere valid.
  placeMove(id, want) {
    const c = this.#cards.find((x) => x.id === id);
    if (!c) return null;
    const p = engine.findPlacement(this.#cards, c, c, this.#ctx.grid, { want, ignoreId: id });
    return p && { col: p.col, row: p.row };
  }

  // Closest valid size to the one the user is dragging towards.
  fitResize(id, cols, rows) { return engine.bestResize(this.#cards, id, cols, rows, this.#ctx); }

  /* ---- persistence ---- */

  async save(url = "/api/layout") {
    const res = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(this.toJSON()),
    });
    if (res.status === 401) throw Object.assign(new Error("Not signed in"), { status: 401 });
    if (!res.ok) throw new Error(`Saving failed (${res.status}): ${await res.text()}`);
  }

  #apply(reason, result) {
    if (result.ok) {
      this.#cards = result.cards;
      this.#emit(reason);
    }
    return result;
  }

  #emit(reason) {
    this.dispatchEvent(new CustomEvent("change", { detail: { reason, doc: this.toJSON() } }));
  }
}
