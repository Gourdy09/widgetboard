import { LayoutStore } from "../core/layoutStore.js";
import { Dashboard } from "./core/dashboard.js";
import { startSync } from "../core/layoutSync.js";
import { loadCardStyles } from "./cards/index.js";

async function main() {
  const container = document.getElementById("dashboard-grid");
  try {
    loadCardStyles();
    const store = await LayoutStore.create();
    new Dashboard(container, store);
    window.dashboard = store; // for console debugging

    if (new URLSearchParams(location.search).has("preview")) {
      // Embedded in the admin theme editor: render whatever the parent sends instead of the saved layout
      window.addEventListener("message", (e) => {
        if (e.origin === location.origin && e.data?.type === "wb-preview") store.load(e.data.doc);
      });
      parent.postMessage({ type: "wb-preview-ready" }, location.origin);
    } else {
      await startSync(store);
    }
  } catch (err) {
    console.error(err);
    container.textContent = "Could not load the dashboard.";
  }
}

main();
