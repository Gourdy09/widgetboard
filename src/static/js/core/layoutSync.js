// Keeps the wall in sync with the saved layout:
//   1. load from the server (and remember it in localStorage),
//   2. if the server is unreachable, use the last copy we remembered, then the built-in default,
//   3. poll for changes so edits made in /admin show up without a reload.
const CACHE_KEY = "widgetboard.layout";

const cacheGet = () => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch { return null; }
};
const cacheSet = (text) => {
  try { localStorage.setItem(CACHE_KEY, text); } catch { /* storage may be unavailable in kiosk mode */ }
};

async function fetchText(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(`${url} returned ${res.status}`);
  return res.text();
}

export async function startSync(store, { url = "/api/layout", fallbackUrl = "/static/json/dashboard.json", pollMs = 5000 } = {}) {
  let last = null;

  const apply = (text) => {
    if (text === last) return;
    last = text;
    store.load(JSON.parse(text));
  };

  try {
    const text = await fetchText(url);
    apply(text);
    cacheSet(text);
  } catch (err) {
    console.warn(`Layout from ${url} unavailable`, err);
    const cached = cacheGet();
    if (cached) store.load(cached);
    else store.load(JSON.parse(await fetchText(fallbackUrl)));
  }

  const timer = setInterval(async () => {
    try {
      const text = await fetchText(url);
      if (text !== last) {
        apply(text);
        cacheSet(text);
      }
    } catch { /* offline: keep showing what we have */ }
  }, pollMs);

  return () => clearInterval(timer);
}
