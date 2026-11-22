import { h, clamp, hueFor } from "./dom.js";
import { getCardMeta } from "../cards/index.js";

// The preview grid. Blocks show id, type and size. Drag a block to move it, drag its bottom-right
// corner to resize it, or use the keyboard (arrows move, shift+arrows resize, Delete removes).
// All placement rules live in the store/engine: the editor only asks "where would this land?".
export class GridEditor {
  #root;
  #store;
  #onSelect;
  #toast;
  #board;
  #cells;
  #blocks;
  #ghost;
  #selected = null;

  constructor(root, store, { onSelect, toast }) {
    this.#root = root;
    this.#store = store;
    this.#onSelect = onSelect;
    this.#toast = toast;
    store.addEventListener("change", () => this.render());
    this.render();
  }

  get selected() { return this.#selected; }

  select(id, { notify = true } = {}) {
    this.#selected = id;
    for (const b of this.#blocks.querySelectorAll(".ge-block")) {
      b.classList.toggle("selected", Number(b.dataset.id) === id);
    }
    if (notify) this.#onSelect?.(id);
  }

  render() {
    const { grid, cards } = this.#store.toJSON();
    this.#cells = h("div", { class: "ge-layer ge-cells" }, Array.from({ length: grid.columns * grid.rows }, () => h("div", { class: "ge-cell" })));
    this.#ghost = h("div", { class: "ge-ghost", hidden: true });
    this.#blocks = h("div", { class: "ge-layer ge-blocks" }, this.#ghost, cards.map((c) => this.#block(c)));
    this.#board = h("div", { class: "ge-board", style: { "--cols": grid.columns, "--rows": grid.rows } }, this.#cells, this.#blocks);
    this.#board.addEventListener("pointerdown", (e) => {
      if (!e.target.closest(".ge-block")) this.select(null);
    });
    this.#root.replaceChildren(this.#board);

    if (this.#selected !== null && !cards.some((c) => c.id === this.#selected)) this.select(null);
    else this.select(this.#selected, { notify: false });
  }

  /* ---------- blocks ---------- */

  #block(card) {
    const meta = getCardMeta(card.type);
    const el = h("div", {
      class: "ge-block", tabindex: "0", "data-id": card.id,
      title: `#${card.id} \u00b7 ${card.type} \u00b7 ${card.col_span}\u00d7${card.row_span} \u00b7 column ${card.col}, row ${card.row}`,
      style: { gridColumn: `${card.col} / span ${card.col_span}`, gridRow: `${card.row} / span ${card.row_span}`, "--hue": hueFor(card.type) },
    },
      h("div", { class: "ge-top" }, h("span", { class: "ge-id" }, `#${card.id}`), h("span", { class: "ge-type" }, card.type)),
      h("div", { class: "ge-summary" }, meta.summary?.(card) ?? ""),
      h("span", { class: "ge-size" }, `${card.col_span}\u00d7${card.row_span}`),
      h("div", { class: "ge-handle", title: "Drag to resize" }),
    );
    el.addEventListener("pointerdown", (e) => this.#pointerDown(e, card.id));
    el.addEventListener("keydown", (e) => this.#keyDown(e, card.id));
    return el;
  }

  #cellAt(x, y) {
    const { columns, rows } = this.#store.grid;
    const r = this.#cells.getBoundingClientRect();
    const gap = parseFloat(getComputedStyle(this.#cells).columnGap) || 0;
    const cw = (r.width - gap * (columns - 1)) / columns;
    const ch = (r.height - gap * (rows - 1)) / rows;
    return {
      col: clamp(Math.floor((x - r.left) / (cw + gap)) + 1, 1, columns),
      row: clamp(Math.floor((y - r.top) / (ch + gap)) + 1, 1, rows),
    };
  }

  #showGhost(col, row, cs, rs, invalid) {
    this.#ghost.hidden = false;
    this.#ghost.classList.toggle("invalid", invalid);
    this.#ghost.style.gridColumn = `${col} / span ${cs}`;
    this.#ghost.style.gridRow = `${row} / span ${rs}`;
  }

  #hideGhost() { this.#ghost.hidden = true; }

  #pointerDown(e, id) {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection while dragging
    const el = e.currentTarget;
    el.focus({ preventScroll: true });
    this.select(id);

    const card = this.#store.card(id);
    const { columns, rows } = this.#store.grid;
    const resize = !!e.target.closest(".ge-handle");
    const start = { x: e.clientX, y: e.clientY };
    const grab = this.#cellAt(e.clientX, e.clientY);
    const off = { c: grab.col - card.col, r: grab.row - card.row };
    let moved = false;
    let target = null;

    el.setPointerCapture(e.pointerId);

    const onMove = (ev) => {
      if (!moved && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 4) return;
      moved = true;
      const cell = this.#cellAt(ev.clientX, ev.clientY);
      if (resize) {
        el.classList.add("resizing");
        target = this.#store.fitResize(id, cell.col - card.col + 1, cell.row - card.row + 1);
        el.style.gridColumn = `${card.col} / span ${target.col_span}`;
        el.style.gridRow = `${card.row} / span ${target.row_span}`;
        el.querySelector(".ge-size").textContent = `${target.col_span}\u00d7${target.row_span}`;
      } else {
        el.classList.add("dragging");
        const want = {
          col: clamp(cell.col - off.c, 1, columns - card.col_span + 1),
          row: clamp(cell.row - off.r, 1, rows - card.row_span + 1),
        };
        target = this.#store.placeMove(id, want);
        el.style.transform = `translate(${ev.clientX - start.x}px, ${ev.clientY - start.y}px)`;
        const at = target ?? want;
        this.#showGhost(at.col, at.row, card.col_span, card.row_span, !target);
      }
    };

    const finish = (cancelled) => {
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", onUp);
      el.removeEventListener("pointercancel", onCancel);
      try { el.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      this.#hideGhost();
      if (!moved) return;
      if (!cancelled && target) {
        const res = resize
          ? this.#store.resize(id, target.col_span, target.row_span)
          : this.#store.move(id, target.col, target.row);
        if (!res.ok) this.#toast?.(res.reason, "error");
      } else if (!cancelled && !resize) {
        this.#toast?.("No room there", "error");
      }
      this.render(); // snaps the block back if nothing changed
    };
    const onUp = () => finish(false);
    const onCancel = () => finish(true);

    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", onUp);
    el.addEventListener("pointercancel", onCancel);
  }

  #keyDown(e, id) {
    if (e.key === "Delete") {
      e.preventDefault();
      this.#store.remove(id);
      return;
    }
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const c = this.#store.card(id);
    const res = e.shiftKey
      ? this.#store.resize(id, c.col_span + d[0], c.row_span + d[1])
      : this.#store.move(id, c.col + d[0], c.row + d[1]);
    if (!res.ok) this.#toast?.(res.reason, "error");
    this.#blocks.querySelector(`[data-id="${id}"]`)?.focus({ preventScroll: true });
  }

  /* ---------- drop target for the palette ---------- */

  // Called while a palette item is dragged. Shows where the widget would land and returns it.
  hover(clientX, clientY, type) {
    const r = this.#board.getBoundingClientRect();
    const inside = clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom;
    if (!inside) {
      this.#hideGhost();
      return { inside: false, target: null };
    }
    const { columns, rows } = this.#store.grid;
    const lim = this.#store.limitsFor(type);
    const def = getCardMeta(type).size?.default ?? lim.min;
    const cs = clamp(def.col_span, lim.min.col_span, lim.max.col_span);
    const rs = clamp(def.row_span, lim.min.row_span, lim.max.row_span);
    const cell = this.#cellAt(clientX, clientY);
    const want = {
      col: clamp(cell.col - Math.floor((cs - 1) / 2), 1, columns - cs + 1),
      row: clamp(cell.row - Math.floor((rs - 1) / 2), 1, rows - rs + 1),
    };
    const target = this.#store.placeNew(type, want);
    if (target) this.#showGhost(target.col, target.row, target.col_span, target.row_span, false);
    else this.#showGhost(want.col, want.row, cs, rs, true);
    return { inside: true, target };
  }

  endHover() { this.#hideGhost(); }
}
