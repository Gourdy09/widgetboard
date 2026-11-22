import { h } from "./dom.js";
import { getCardMeta, listCardTypes } from "../cards/index.js";
import { SECTIONS } from "../core/layoutEngine.js";
import { textField, numberField, selectField, fieldFromSchema } from "./fields.js";

const VISIBILITY_OPTIONS = [
  { value: "visible", label: "Visible" },
  { value: "hidden", label: "Hidden (keeps its space)" },
  { value: "collapsed", label: "Removed (others expand)" },
];

// The options panel under the grid for the selected widget.
export class Inspector {
  #root;
  #store;
  #toast;
  #id = null;
  #type = null;
  #fields = []; // { field, read(card) }

  constructor(root, store, { toast }) {
    this.#root = root;
    this.#store = store;
    this.#toast = toast;
    store.addEventListener("change", () => {
      if (this.#id === null) return;
      const card = store.card(this.#id);
      if (!card) return this.show(null);
      if (card.type !== this.#type) this.#render(card);
      else this.#sync(card);
    });
    this.show(null);
  }

  show(id) {
    this.#id = id;
    this.#render(id === null ? null : this.#store.card(id));
  }

  // Apply a change; if the engine refuses (e.g. it would overlap), say why and put the old value back.
  #set(patch) {
    const res = this.#store.update(this.#id, patch);
    if (!res.ok) {
      this.#toast(res.reason, "error");
      this.#sync(this.#store.card(this.#id), true);
    }
  }

  #sync(card, force = false) {
    for (const { field, read } of this.#fields) {
      if (!force && field.el.contains(document.activeElement)) continue;
      field.setValue(read(card));
    }
  }

  #render(card) {
    this.#fields = [];
    if (!card) {
      this.#type = null;
      this.#root.replaceChildren(
        h("div", { class: "Box-body empty" },
          h("strong", {}, "No widget selected"),
          h("p", {}, "Click a widget in the grid to edit it, or drag one from the list onto the grid."),
        ));
      return;
    }

    this.#type = card.type;
    const meta = getCardMeta(card.type);
    const grid = this.#store.grid;
    const lim = this.#store.limitsFor(card.type);
    const reg = (field, read) => { this.#fields.push({ field, read }); return field.el; };

    const general = [
      reg(textField({ label: "ID", value: card.id, readonly: true }), (c) => c.id),
      reg(selectField({
        label: "Type", value: card.type,
        options: listCardTypes().map((t) => ({ value: t.type, label: t.label })),
        onChange: (v) => this.#set({ type: v }),
        help: "Changing the type resets its options.",
      }), (c) => c.type),
      reg(textField({ label: "Title", value: card.title, onChange: (v) => this.#set({ title: v }) }), (c) => c.title),
      reg(textField({ label: "Subtitle", value: card.subtitle, onChange: (v) => this.#set({ subtitle: v }) }), (c) => c.subtitle),
      reg(textField({ label: "Footer", value: card.footer, onChange: (v) => this.#set({ footer: v }) }), (c) => c.footer),
    ];

    const typeFields = Object.entries(meta.params ?? {}).map(([key, schema]) =>
      reg(fieldFromSchema(schema, card.params[key], (v) => this.#set({ params: { [key]: v } })), (c) => c.params[key] ?? ""));

    const visibility = SECTIONS.map((s) =>
      reg(selectField({
        label: `${s[0].toUpperCase() + s.slice(1)} visibility`, value: card.config[`${s}_visibility`], options: VISIBILITY_OPTIONS,
        onChange: (v) => this.#set({ config: { [`${s}_visibility`]: v } }),
      }), (c) => c.config[`${s}_visibility`]));

    const num = (label, key, min, max) =>
      reg(numberField({ label, value: card[key], min, max, onChange: (v) => this.#set({ [key]: v }) }), (c) => c[key]);
    const layout = [
      num("Column", "col", 1, grid.columns),
      num("Row", "row", 1, grid.rows),
      num("Width (columns)", "col_span", lim.min.col_span, lim.max.col_span),
      num("Height (rows)", "row_span", lim.min.row_span, lim.max.row_span),
    ];

    const advanced = [
      reg(numberField({
        label: "Refresh every (ms)", value: card.refreshMs, min: meta.minRefreshMs ?? 1000, step: 1000,
        onChange: (v) => this.#set({ refreshMs: v }),
      }), (c) => c.refreshMs),
      reg(textField({
        label: "API URL override", value: card.apiUrl, placeholder: "Leave empty to use the card's default",
        onChange: (v) => this.#set({ apiUrl: v }),
      }), (c) => c.apiUrl),
    ];

    const section = (title, ...children) =>
      h("fieldset", { class: "fieldset" }, h("legend", {}, title), h("div", { class: "fieldset-grid" }, children.flat()));

    this.#root.replaceChildren(
      h("div", { class: "Box-header inspector-head" },
        h("div", {}, h("strong", {}, `Widget #${card.id}`), h("span", { class: "Label" }, meta.label)),
        h("div", { class: "btn-group" },
          h("button", { class: "btn btn-sm", type: "button", onclick: () => this.#duplicate() }, "Duplicate"),
          h("button", { class: "btn btn-sm btn-danger", type: "button", onclick: () => this.#store.remove(this.#id) }, "Remove"))),
      h("div", { class: "Box-body inspector-body" },
        section("General", general),
        typeFields.length ? section(`${meta.label} options`, typeFields) : null,
        section("Visibility of each element", visibility),
        section("Position & size", layout),
        h("details", { class: "advanced" }, h("summary", {}, "Advanced"), h("div", { class: "fieldset-grid" }, advanced)),
      ),
    );
  }

  #duplicate() {
    const { id, col, row, ...rest } = this.#store.card(this.#id);
    const res = this.#store.add(rest);
    if (!res.ok) return this.#toast(res.reason, "error");
    this.#toast(`Duplicated as #${res.card.id}`, "success");
  }
}
