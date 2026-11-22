import { LayoutStore } from "../core/layoutStore.js";
import { listCardTypes } from "../cards/index.js";
import { toast, store as ls, h } from "./dom.js";
import { GridEditor } from "./gridEditor.js";
import { buildPalette } from "./palette.js";
import { Inspector } from "./inspector.js";
import { ThemePanel } from "./themePanel.js";

const DRAFT_KEY = "widgetboard.admin.draft"; // unsaved edits survive a reload or a crash
const $ = (sel) => document.querySelector(sel);

let started = false;

/* ---------- sign in ---------- */

function showLogin(message) {
  $("#app").hidden = true;
  $("#login").hidden = false;
  const err = $("#login-error");
  err.hidden = !message;
  err.textContent = message ?? "";
  $("#username").focus();
}

$("#login-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = $("#username").value;
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password: $("#password").value }),
  }).catch(() => null);
  if (res?.ok) {
    $("#password").value = "";
    return start(username);
  }
  showLogin(res ? "Incorrect username or password." : "Could not reach the server.");
});

$("#logout").addEventListener("click", async () => {
  await fetch("/api/logout", { method: "POST" });
  showLogin();
});

/* ---------- editor ---------- */

async function start(user) {
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#user").textContent = user;
  if (started) return; // signing in again after a session timeout keeps all edits
  started = true;

  const store = await LayoutStore.create();
  window.wbStore = store; // handy for console debugging

  // 1. what the server has
  const serverText = await fetch("/api/layout", { cache: "no-store" }).then((r) => r.text());
  store.load(JSON.parse(serverText));
  let savedJSON = JSON.stringify(store.toJSON());

  // 2. unsaved work from last time
  const draft = ls.get(DRAFT_KEY);
  if (draft && draft !== savedJSON) {
    try {
      store.load(JSON.parse(draft));
      $("#banner").hidden = false;
    } catch { ls.remove(DRAFT_KEY); }
  }

  /* panels */
  const inspector = new Inspector($("#inspector"), store, { toast });
  const editor = new GridEditor($("#grid-editor"), store, { onSelect: (id) => inspector.show(id), toast });
  buildPalette($("#palette-list"), store, editor, { toast });
  const themePanel = new ThemePanel($("#theme-panel"), store);

  /* grid size */
  const cols = $("#grid-cols");
  const rows = $("#grid-rows");
  const syncGrid = () => {
    const g = store.grid;
    const t = store.theme.spacing;
    cols.value = g.columns;
    rows.value = g.rows;
    const cw = Math.floor((1920 - 2 * t.padding - t.gap * (g.columns - 1)) / g.columns);
    const ch = Math.floor((1080 - 2 * t.padding - t.gap * (g.rows - 1)) / g.rows);
    const info = $("#cell-info");
    info.textContent = `Each cell is about ${cw}\u00d7${ch}px on a 1920\u00d71080 screen.`;
    info.classList.toggle("warn", Math.min(cw, ch) < 70);
    if (Math.min(cw, ch) < 70) info.textContent += " That is very small; cards will be hard to read.";
  };
  const applyGrid = () => {
    const wanted = { columns: Number(cols.value), rows: Number(rows.value) };
    let res = store.setGrid(wanted);
    if (res.needsConfirm) {
      if (!confirm(`${res.reason} and will be removed. Continue?`)) return syncGrid();
      res = store.setGrid(wanted, { force: true });
    }
    if (!res.ok) toast(res.reason, "error");
  };
  cols.addEventListener("change", applyGrid);
  rows.addEventListener("change", applyGrid);

  /* save / dirty state */
  const saveBtn = $("#save");
  const status = $("#save-status");
  const isDirty = () => JSON.stringify(store.toJSON()) !== savedJSON;
  const refreshDirty = () => {
    const dirty = isDirty();
    saveBtn.disabled = !dirty;
    status.textContent = dirty ? "Unsaved changes" : "All changes saved";
    status.classList.toggle("dirty", dirty);
    if (dirty) ls.set(DRAFT_KEY, JSON.stringify(store.toJSON()));
    else ls.remove(DRAFT_KEY);
  };
  store.addEventListener("change", () => { refreshDirty(); syncGrid(); });
  refreshDirty();
  syncGrid();

  saveBtn.addEventListener("click", async () => {
    saveBtn.disabled = true;
    try {
      await store.save();
      savedJSON = JSON.stringify(store.toJSON());
      $("#banner").hidden = true;
      refreshDirty();
      toast("Saved. The wall display updates within a few seconds.", "success");
    } catch (err) {
      if (err.status === 401) showLogin("Your session expired. Sign in again; your edits are kept.");
      else toast(err.message, "error", 7000);
      refreshDirty();
    }
  });

  $("#discard").addEventListener("click", () => {
    ls.remove(DRAFT_KEY);
    store.load(JSON.parse(serverText));
    savedJSON = JSON.stringify(store.toJSON());
    $("#banner").hidden = true;
    refreshDirty();
  });

  window.addEventListener("beforeunload", (e) => { if (isDirty()) e.preventDefault(); });

  /* tabs */
  const tabs = { layout: $("#tab-layout"), theme: $("#tab-theme") };
  const show = (name) => {
    for (const [k, el] of Object.entries(tabs)) el.hidden = k !== name;
    for (const b of document.querySelectorAll("[data-tab]")) b.classList.toggle("selected", b.dataset.tab === name);
    if (name === "theme") themePanel.activate();
    history.replaceState(null, "", `#${name}`);
  };
  document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => show(b.dataset.tab)));
  show(location.hash === "#theme" ? "theme" : "layout");

  $("#type-count").textContent = String(listCardTypes().length);
}

/* ---------- boot ---------- */

(async function boot() {
  const s = await fetch("/api/session", { cache: "no-store" }).then((r) => r.json()).catch(() => ({ authenticated: false }));
  if (s.authenticated) start(s.user);
  else showLogin();
})();
