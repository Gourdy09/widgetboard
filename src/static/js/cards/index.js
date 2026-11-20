import * as defaultCard from "./defaultCard.js";
import * as tickerCard from "./tickerCard.js";

// Automatically map each module's `type` to its `render` function
const registry = Object.fromEntries(
  [defaultCard, tickerCard].map((mod) => [mod.type, mod.render])
);

export function getCardRenderer(type) {
  return registry[type] || registry.default;
}