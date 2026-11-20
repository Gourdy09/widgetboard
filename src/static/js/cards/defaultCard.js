export const type = "default";

export function render(slots, cardData) {
  if (slots.title) {
    // Title of the card
    slots.title.textContent = cardData.title || "Default Card";
  }

  if (slots.subtitle) {
    // Subtitle of the card
    slots.subtitle.textContent = cardData.subtitle || "Default Subtitle";
  }

  if (slots.main) {
    // All helper functions, DOM creation, and listeners stay isolated in this file
    const content = buildWidgetContent(cardData.data);
    slots.main.append(content);
  }

  if (slots.footer) {
    // Subtitle of the card
    slots.footer.textContent = cardData.footer || "Default Footer";
  }
}

function buildWidgetContent(data) {
  const div = document.createElement("div");
  // ...custom widget logic...
  div.textContent = typeof data === "string" ? data : "Default Content";
  return div;
}
