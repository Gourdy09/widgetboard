import * as defaultCard from "./defaultCard.js";
import * as tickerCard from "./tickerCard.js";
import * as calendarCard from "./calendarCard.js";
// @cards:imports  (the `newcard` command adds new imports above this line)

// To add a card type run, from the src/ folder:   go run ./cmd/newcard <name>
// It creates the files and registers them here.
const modules = [
  defaultCard,
  tickerCard,
  calendarCard,
  // @cards:list  (the `newcard` command adds new entries above this line)
];

const registry = new Map(modules.map((mod) => [mod.type, mod]));

export const hasCardType = (type) => registry.has(type);

const resolve = (type) => registry.get(type) ?? registry.get("default");

export const getCardRenderer = (type) => resolve(type).render;
export const getCardMeta = (type) => resolve(type).meta;

// For the editor's widget palette and options forms.
export function listCardTypes() {
  return modules.map((mod) => ({ type: mod.type, ...mod.meta }));
}

// Each card type may ship its own stylesheet (export const css = "/static/css/cards/<name>.css").
export function loadCardStyles() {
  for (const mod of modules) {
    if (!mod.css || document.querySelector(`link[href="${mod.css}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = mod.css;
    document.head.append(link);
  }
}
