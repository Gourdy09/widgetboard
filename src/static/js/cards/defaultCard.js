export const type = "default";
export const css = "/static/css/cards/default.css";

// Everything the layout engine and the editor need to know about this card type.
export const meta = {
  label: "Basic Card",
  description: "A title and some text. Good as a starting point.",
  size: {
    default: { col_span: 2, row_span: 1 },
    min: { col_span: 1, row_span: 1 },
    // max: omitted = as big as the grid
  },
  defaults: { params: { text: "" } },
  // Describes `params` so the editor can build a form. Field types:
  // string | text | number | select | combobox | boolean
  params: {
    text: { type: "text", label: "Text" },
  },
  summary: (card) => card.params?.text?.slice(0, 40) ?? "",
};

export function render(slots, cardData) {
  if (slots.title) slots.title.textContent = cardData.title || "Basic card";
  if (slots.subtitle) slots.subtitle.textContent = cardData.subtitle;
  if (slots.footer) slots.footer.textContent = cardData.footer;
  if (slots.main) {
    const p = document.createElement("div");
    p.className = "basic-text";
    p.textContent = cardData.params?.text ?? "";
    slots.main.append(p);
  }
}
