import { getCardRenderer } from "../cards/index.js";

const response = await fetch("/static/json/layout.json");
const cardTemplate = await response.json();

let nextCardId = 0;

export function newCardConfig(overrides = {}) {
  const base = structuredClone(cardTemplate);
  return {
    ...base,
    ...overrides,
    params: { ...base.params, ...(overrides.params || {}) },
    config: { ...base.config, ...(overrides.config || {}) }
  };
}

export function makeCard(cardData) {
  const card = document.createElement("div");

  const id = nextCardId++;
  card.id = `card-${id}`;
  card.dataset.cardId = id;

  card.classList.add("grid-item");
  card.style.gridRow = `${cardData.row} / span ${cardData.row_span}`;
  card.style.gridColumn = `${cardData.col} / span ${cardData.col_span}`;
  return card;
}

export function populateCard(card, cardData) {
  // Matches "config" in cardTemplate.json
  const config = cardData.config || {};

  const sections = [
    { key: "title", tag: "h2" },
    { key: "subtitle", tag: "h3" },
    { key: "main", tag: "div" },
    { key: "footer", tag: "p" },
  ];

  const slots = {};

  sections.forEach(({ key, tag }) => {
    const state = config[`${key}_visibility`] || "visible";
    if (state === "collapsed") return;

    const el = document.createElement(tag);
    el.classList.add(`card-${key}`);

    if (state === "hidden") {
      el.style.visibility = "hidden";
    }

    slots[key] = el;
    card.append(el);
  });

  card.dataset.cardType = cardData.type || "default";
  const render = getCardRenderer(cardData.type);
  return render(slots, cardData);
}

export function createCard(cardData) {
  const card = makeCard(cardData);
  populateCard(card, cardData);
  return card;
}
