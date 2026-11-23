import { createCard, applyPlacement, contentKey } from "../utils/cardFactory.js";
import { applyTheme } from "../core/theme.js";

// Renders a LayoutStore into the page. Untouched cards keep their DOM and timers; moved/resized
// cards only get new CSS variables; edited cards are rebuilt; removed cards are destroyed.
export class Dashboard {
  #container;
  #store;
  #mounted = new Map(); // id -> { el, destroy, key }

  constructor(container, store) {
    this.#container = container;
    this.#store = store;
    store.addEventListener("change", () => this.render());
    this.render();
  }

  render() {
    const { grid, theme, cards } = this.#store.toJSON();
    const c = this.#container;
    c.style.setProperty("--grid-columns", grid.columns);
    c.style.setProperty("--grid-rows", grid.rows);
    applyTheme(theme);

    const liveIds = new Set(cards.map((card) => card.id));
    for (const [id, m] of this.#mounted) {
      if (!liveIds.has(id)) {
        m.destroy();
        this.#mounted.delete(id);
      }
    }

    for (const card of cards) {
      const key = contentKey(card);
      let m = this.#mounted.get(card.id);
      if (m && m.key !== key) {
        m.destroy();
        m = undefined;
      }
      if (!m) {
        m = { ...createCard(card), key };
        this.#mounted.set(card.id, m);
        c.append(m.el);
      } else {
        applyPlacement(m.el, card);
      }
    }
  }
}
