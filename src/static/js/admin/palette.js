import { h } from "./dom.js";
import { listCardTypes } from "../cards/index.js";

const ICON = '<svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor"><path d="M1.75 1h5.5c.966 0 1.75.784 1.75 1.75v3.5A1.75 1.75 0 0 1 7.25 8h-5.5A1.75 1.75 0 0 1 0 6.25v-3.5C0 1.784.784 1 1.75 1ZM1.5 2.75v3.5c0 .138.112.25.25.25h5.5a.25.25 0 0 0 .25-.25v-3.5a.25.25 0 0 0-.25-.25h-5.5a.25.25 0 0 0-.25.25ZM9.75 9h4.5c.966 0 1.75.784 1.75 1.75v2.5A1.75 1.75 0 0 1 14.25 15h-4.5A1.75 1.75 0 0 1 8 13.25v-2.5C8 9.784 8.784 9 9.75 9Z"/></svg>';

// The list of widget types. Drag one onto the grid, or click it to drop it in the first free spot.
export function buildPalette(root, store, editor, { toast }) {
  const addAt = (type, spot) => {
    const res = store.add({ type, ...spot });
    if (!res.ok) return toast(res.reason, "error");
    editor.select(res.card.id);
  };

  for (const t of listCardTypes()) {
    const def = t.size?.default ?? { col_span: 1, row_span: 1 };
    const item = h("div", { class: "palette-item", role: "button", tabindex: "0", title: `Drag onto the grid, or click to add. ${t.description ?? ""}` },
      h("span", { class: "palette-icon", innerHTML: undefined }),
      h("div", { class: "palette-text" },
        h("div", { class: "palette-label" }, t.label),
        h("div", { class: "palette-hint" }, `${def.col_span}\u00d7${def.row_span} by default`)),
    );
    item.firstChild.innerHTML = ICON; // static markup above, never user input

    item.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); addAt(t.type); }
    });

    item.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const start = { x: e.clientX, y: e.clientY };
      let ghost = null;
      let dragging = false;

      const move = (ev) => {
        if (!dragging && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > 4) {
          dragging = true;
          ghost = h("div", { class: "drag-ghost" }, t.label);
          document.body.append(ghost);
          document.body.classList.add("is-dragging");
        }
        if (!dragging) return;
        ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 12}px)`;
        editor.hover(ev.clientX, ev.clientY, t.type);
      };

      const up = (ev) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        window.removeEventListener("pointercancel", cancel);
        if (!dragging) return addAt(t.type); // plain click
        const { inside, target } = editor.hover(ev.clientX, ev.clientY, t.type);
        end();
        if (!inside) return;
        if (target) addAt(t.type, target);
        else toast("No room there. Remove a widget or make the grid bigger.", "error");
      };
      const cancel = () => { window.removeEventListener("pointermove", move); window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); end(); };
      const end = () => { ghost?.remove(); document.body.classList.remove("is-dragging"); editor.endHover(); };

      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      window.addEventListener("pointercancel", cancel);
    });

    root.append(item);
  }
}
