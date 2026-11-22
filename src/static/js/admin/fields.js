import { h } from "./dom.js";

// Form controls. Each returns { el, input, setValue(v) } so panels can keep them in sync with the store.
let uid = 0;
const nextId = () => `wb-f${++uid}`;

function group(label, control, id, help) {
  return h("div", { class: "form-group" }, h("label", { class: "form-label", for: id }, label), control, help ? h("p", { class: "note" }, help) : null);
}

const asOptions = (opts) => opts.map((o) => (typeof o === "string" ? { value: o, label: o } : o));

export function textField({ label, value = "", onChange, readonly = false, multiline = false, placeholder, help }) {
  const id = nextId();
  const input = h(multiline ? "textarea" : "input", {
    id, class: "form-control", value: String(value ?? ""), readOnly: readonly, placeholder,
    type: multiline ? null : "text", rows: multiline ? 3 : null,
  });
  if (!readonly) input.addEventListener("input", () => onChange?.(input.value));
  return {
    el: group(label, input, id, help), input,
    setValue(v) { const s = String(v ?? ""); if (input.value !== s) input.value = s; },
  };
}

export function numberField({ label, value, min, max, step = 1, onChange, help }) {
  const id = nextId();
  const input = h("input", { id, class: "form-control", type: "number", min, max, step, value: String(value ?? "") });
  input.addEventListener("change", () => {
    const n = Number(input.value);
    if (input.value === "" || !Number.isFinite(n)) return void (input.value = String(value ?? ""));
    onChange?.(n);
  });
  return {
    el: group(label, input, id, help), input,
    setValue(v) { value = v; if (input.value !== String(v)) input.value = String(v); },
  };
}

export function selectField({ label, value, options, onChange, help }) {
  const id = nextId();
  const opts = asOptions(options);
  const select = h("select", { id, class: "form-select" }, opts.map((o) => h("option", { value: o.value }, o.label ?? o.value)));
  select.value = String(value ?? "");
  select.addEventListener("change", () => onChange?.(select.value));
  return {
    el: group(label, select, id, help), input: select,
    setValue(v) { if (select.value !== String(v)) select.value = String(v); },
  };
}

export function checkboxField({ label, value, onChange, help }) {
  const id = nextId();
  const input = h("input", { id, type: "checkbox", checked: !!value });
  input.addEventListener("change", () => onChange?.(input.checked));
  return {
    el: h("div", { class: "form-group form-check" }, input, h("label", { for: id }, label), help ? h("p", { class: "note" }, help) : null),
    input,
    setValue(v) { input.checked = !!v; },
  };
}

export function rangeField({ label, value, min, max, step = 1, format = (v) => String(v), onChange }) {
  const id = nextId();
  const out = h("output", { class: "range-out" }, format(value));
  const input = h("input", { id, class: "form-range", type: "range", min, max, step, value: String(value) });
  input.addEventListener("input", () => {
    out.textContent = format(Number(input.value));
    onChange?.(Number(input.value));
  });
  return {
    el: h("div", { class: "form-group" }, h("label", { class: "form-label", for: id }, label, out), input),
    input,
    setValue(v) { input.value = String(v); out.textContent = format(Number(v)); },
  };
}

const HEX6 = /^#[0-9a-f]{6}$/i;
export function colorField({ label, value, onChange }) {
  const id = nextId();
  const swatch = h("input", { type: "color", class: "color-swatch", value, "aria-label": `${label} colour picker` });
  const text = h("input", { id, type: "text", class: "form-control mono", maxLength: 7, value, spellcheck: "false" });
  swatch.addEventListener("input", () => {
    text.value = swatch.value;
    onChange?.(swatch.value);
  });
  text.addEventListener("change", () => {
    const v = text.value.trim();
    if (HEX6.test(v)) {
      swatch.value = v.toLowerCase();
      onChange?.(v.toLowerCase());
    } else text.value = swatch.value;
  });
  return {
    el: h("div", { class: "form-group" }, h("label", { class: "form-label", for: id }, label), h("div", { class: "color-row" }, swatch, text)),
    input: text,
    setValue(v) { swatch.value = v; if (document.activeElement !== text) text.value = v; },
  };
}

// Dropdown with search. Local options filter instantly; if `searchUrl` is given ("...?q={q}") the server
// is asked for more as you type. With allowCustom you can also type any value that isn't in the list.
export function comboField({ label, value = "", options = [], searchUrl, allowCustom = true, uppercase = false, onChange, help }) {
  const id = nextId();
  const fixed = asOptions(options);
  let current = String(value ?? "");
  let remote = [];
  let typed = false;
  let open = false;
  let active = -1;
  let shown = [];
  let timer = 0;
  let abort = null;

  const input = h("input", {
    id, class: "form-control", type: "text", role: "combobox", autocomplete: "off", spellcheck: "false",
    "aria-autocomplete": "list", "aria-expanded": "false", value: current,
  });
  const list = h("ul", { class: "combo-list", role: "listbox", hidden: true });
  const wrap = h("div", { class: "combo" }, input, list);
  const norm = (v) => (uppercase ? v.trim().toUpperCase() : v.trim());

  function build() {
    const q = typed ? input.value.trim().toLowerCase() : "";
    const local = fixed.filter((o) => !q || o.value.toLowerCase().includes(q) || (o.label ?? "").toLowerCase().includes(q));
    const seen = new Set(local.map((o) => o.value));
    const all = [...local, ...remote.filter((o) => !seen.has(o.value))];
    if (allowCustom && typed && q && !all.some((o) => o.value.toLowerCase() === q)) {
      all.push({ value: norm(input.value), label: `Use \u201c${norm(input.value)}\u201d`, custom: true });
    }
    return all.slice(0, 40);
  }

  function paint() {
    shown = build();
    list.replaceChildren(
      ...shown.map((o, i) =>
        h("li", {
          class: `combo-item${i === active ? " active" : ""}${o.custom ? " custom" : ""}`, role: "option",
          onmousedown: (e) => { e.preventDefault(); choose(o); },
        }, o.label ?? o.value),
      ),
    );
    list.hidden = !open || shown.length === 0;
    input.setAttribute("aria-expanded", String(!list.hidden));
  }

  function close() { open = false; active = -1; paint(); }

  function choose(o) {
    current = norm(o.value);
    input.value = current;
    typed = false;
    close();
    onChange?.(current);
  }

  function commit() {
    const v = norm(input.value);
    if (!v) { input.value = current; return; }
    const known = fixed.some((o) => o.value === v) || remote.some((o) => o.value === v);
    if (v !== current && (allowCustom || known)) {
      current = v;
      input.value = v;
      onChange?.(v);
    } else input.value = current;
  }

  function search() {
    const q = input.value.trim();
    clearTimeout(timer);
    if (!searchUrl || !q) { remote = []; return; }
    timer = setTimeout(async () => {
      abort?.abort();
      abort = new AbortController();
      try {
        const res = await fetch(searchUrl.replace("{q}", encodeURIComponent(q)), { signal: abort.signal });
        if (!res.ok) return;
        remote = await res.json();
        if (open) paint();
      } catch { /* offline or aborted: local options still work */ }
    }, 250);
  }

  input.addEventListener("focus", () => { open = true; typed = false; paint(); });
  input.addEventListener("input", () => { typed = true; open = true; active = -1; paint(); search(); });
  input.addEventListener("blur", () => { close(); commit(); });
  input.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      open = true;
      if (!shown.length) paint();
      active = (active + (e.key === "ArrowDown" ? 1 : -1) + shown.length) % Math.max(shown.length, 1);
      paint();
      list.children[active]?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter") {
      e.preventDefault();
      active >= 0 && shown[active] ? choose(shown[active]) : (commit(), close());
    } else if (e.key === "Escape") {
      input.value = current;
      close();
    }
  });

  return {
    el: group(label, wrap, id, help), input,
    setValue(v) { current = String(v ?? ""); if (document.activeElement !== input) input.value = current; },
  };
}

// Builds the right control for one entry of a card type's `meta.params` schema.
export function fieldFromSchema(schema, value, onChange) {
  const base = { label: schema.label, value, onChange, help: schema.help };
  switch (schema.type) {
    case "number": return numberField({ ...base, min: schema.min, max: schema.max, step: schema.step });
    case "select": return selectField({ ...base, options: schema.options ?? [] });
    case "boolean": return checkboxField(base);
    case "combobox":
      return comboField({ ...base, options: schema.options, searchUrl: schema.searchUrl, allowCustom: schema.allowCustom, uppercase: schema.uppercase });
    case "text": return textField({ ...base, multiline: true });
    default: return textField(base);
  }
}
