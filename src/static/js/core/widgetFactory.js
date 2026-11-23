import { getCardRenderer } from "../cards/index.js";
import { SECTIONS } from "./layoutEngine.js";

const TAGS = { title: "h2", subtitle: "h3", main: "div", footer: "p" };

export async function loadCardTemplate(url = "/static/json/layout.json") {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not load card template (${res.status})`);
  return res.json();
}

// Position and size are CSS variables so the stylesheet decides how to use them.
export function applyPlacement(el, card) {
  el.style.setProperty("--col", card.col);
  el.style.setProperty("--row", card.row);
  el.style.setProperty("--col-span", card.col_span);
  el.style.setProperty("--row-span", card.row_span);
}

// Anything that changes what is drawn inside the card. Moving/resizing is not part of it,
// so dragging a card never re-renders it or re-fetches its data.
export function contentKey(card) {
  const { col, row, col_span, row_span, ...content } = card;
  return JSON.stringify(content);
}

// Visibility per section, from card.config.<section>_visibility:
//   visible   - shown
//   hidden    - invisible but keeps its space (keeps the layout stable)
//   collapsed - not created at all, the rest of the card uses the space
export function createCard(card) {
  const el = document.createElement("div");
  el.id = `card-${card.id}`;
  el.dataset.cardId = card.id;
  el.dataset.cardType = card.type;
  el.classList.add("grid-item");
  applyPlacement(el, card);

  const slots = {};
  for (const key of SECTIONS) {
    const state = card.config[`${key}_visibility`];
    if (state === "collapsed") continue;
    const slot = document.createElement(TAGS[key]);
    slot.classList.add(`card-${key}`);
    if (state === "hidden") slot.style.visibility = "hidden";
    slots[key] = slot;
    el.append(slot);
  }

  // A card whose renderer throws must not take the rest of the dashboard down with it.
  let cleanup;
  try {
    cleanup = getCardRenderer(card.type)(slots, card);
  } catch (err) {
    console.error(`Card ${card.id} (${card.type}) failed to render`, err);
    const target = slots.main ?? el;
    target.textContent = "This card failed to load.";
  }

  return {
    el,
    destroy() {
      if (typeof cleanup === "function") cleanup();
      el.remove();
    },
  };
}
