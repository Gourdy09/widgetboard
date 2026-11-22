import { h } from "./dom.js";
import { COLOR_FIELDS, FONT_STACKS, PRESETS, presetTheme } from "../core/theme.js";
import { colorField, numberField, rangeField, selectField, checkboxField } from "./fields.js";

const SPACING = [
  { key: "gap", label: "Gap between cards", min: 0, max: 48 },
  { key: "padding", label: "Screen padding", min: 0, max: 96 },
  { key: "cardPadding", label: "Card padding", min: 0, max: 48 },
  { key: "radius", label: "Corner radius", min: 0, max: 48 },
  { key: "borderWidth", label: "Border width", min: 0, max: 8 },
];

// Theme editor with a live preview: an iframe running the real dashboard, fed the unsaved theme.
export class ThemePanel {
  #root;
  #store;
  #frame = null;
  #fields = []; // { field, read(theme) }

  constructor(root, store) {
    this.#root = root;
    this.#store = store;
    store.addEventListener("change", () => this.#onChange());
    window.addEventListener("message", (e) => {
      if (this.#frame && e.source === this.#frame.contentWindow && e.data?.type === "wb-preview-ready") this.#post();
    });
    this.#build();
  }

  // The iframe is created the first time the tab is opened, so the Layout tab stays light.
  activate() {
    if (this.#frame) return;
    this.#frame = h("iframe", { class: "preview-frame", src: "/?preview=1", title: "Dashboard preview", width: "1920", height: "1080" });
    const wrap = this.#root.querySelector(".preview-wrap");
    wrap.append(this.#frame);
    const fit = () => {
      const scale = wrap.clientWidth / 1920;
      this.#frame.style.transform = `scale(${scale})`;
      wrap.style.height = `${1080 * scale}px`;
    };
    new ResizeObserver(fit).observe(wrap);
    fit();
  }

  #post() {
    this.#frame?.contentWindow?.postMessage({ type: "wb-preview", doc: this.#store.toJSON() }, location.origin);
  }

  #onChange() {
    const theme = this.#store.theme;
    for (const { field, read } of this.#fields) field.setValue(read(theme));
    this.#post();
  }

  #build() {
    const theme = this.#store.theme;
    const reg = (field, read) => { this.#fields.push({ field, read }); return field.el; };
    const set = (patch) => this.#store.setTheme(patch);

    const presetField = selectField({
      label: "Theme", value: theme.preset,
      options: Object.entries(PRESETS).map(([value, p]) => ({ value, label: p.label })),
      onChange: () => {},
    });
    const apply = h("button", { class: "btn", type: "button", onclick: () => set(presetTheme(presetField.input.value)) }, "Apply preset");
    this.#fields.push({ field: presetField, read: (t) => t.preset });

    const colors = COLOR_FIELDS.map(({ key, label }) =>
      reg(colorField({ label, value: theme.colors[key], onChange: (v) => set({ colors: { [key]: v } }) }), (t) => t.colors[key]));

    const spacing = SPACING.map(({ key, label, min, max }) =>
      reg(numberField({ label, value: theme.spacing[key], min, max, onChange: (v) => set({ spacing: { [key]: v } }) }), (t) => t.spacing[key]));

    const fontOptions = FONT_STACKS.map((f) => ({ value: f.value, label: f.label }));
    if (!FONT_STACKS.some((f) => f.value === theme.typography.fontFamily)) {
      fontOptions.push({ value: theme.typography.fontFamily, label: "Custom" });
    }
    const type = [
      reg(selectField({ label: "Font", value: theme.typography.fontFamily, options: fontOptions, onChange: (v) => set({ typography: { fontFamily: v } }) }), (t) => t.typography.fontFamily),
      reg(rangeField({ label: "Text size", value: theme.typography.scale, min: 0.5, max: 2, step: 0.05, format: (v) => `${Math.round(v * 100)}%`, onChange: (v) => set({ typography: { scale: v } }) }), (t) => t.typography.scale),
      reg(checkboxField({ label: "Card shadow", value: theme.effects.shadow, onChange: (v) => set({ effects: { shadow: v } }) }), (t) => t.effects.shadow),
    ];

    const section = (title, body) => h("div", { class: "Box theme-box" }, h("div", { class: "Box-header" }, h("strong", {}, title)), h("div", { class: "Box-body fieldset-grid" }, body));

    this.#root.replaceChildren(
      h("div", { class: "theme-layout" },
        h("div", { class: "theme-controls" },
          section("Preset", [presetField.el, h("div", { class: "form-group align-end" }, apply)]),
          section("Colours", colors),
          section("Spacing", spacing),
          section("Typography & effects", type)),
        h("div", { class: "theme-preview" },
          h("div", { class: "Box-header" }, h("strong", {}, "Live preview"), h("span", { class: "note" }, "Unsaved changes are shown here")),
          h("div", { class: "preview-wrap" }))),
    );
  }
}
