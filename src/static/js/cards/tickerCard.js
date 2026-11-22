import { getLocalCurrency, getExchangeRate, safeLocale } from "../utils/currency.js";
import { fitText } from "../utils/fitText.js";
export const type = "ticker";
export const css = "/static/css/cards/ticker.css";

const POPULAR = [
  ["AAPL", "Apple"], ["MSFT", "Microsoft"], ["GOOGL", "Alphabet"], ["AMZN", "Amazon"],
  ["NVDA", "NVIDIA"], ["META", "Meta Platforms"], ["TSLA", "Tesla"], ["BRK-B", "Berkshire Hathaway"],
  ["JPM", "JPMorgan Chase"], ["V", "Visa"], ["WMT", "Walmart"], ["XOM", "Exxon Mobil"],
  ["SPY", "SPDR S&P 500 ETF"], ["VOO", "Vanguard S&P 500 ETF"], ["QQQ", "Invesco QQQ"], ["VTI", "Vanguard Total Market"],
  ["DIA", "SPDR Dow Jones ETF"], ["IWM", "iShares Russell 2000"],
  ["BTC-USD", "Bitcoin"], ["ETH-USD", "Ethereum"], ["SOL-USD", "Solana"], ["XRP-USD", "XRP"], ["DOGE-USD", "Dogecoin"],
  ["^GSPC", "S&P 500 index"], ["^DJI", "Dow Jones index"], ["^IXIC", "Nasdaq Composite"],
  ["GC=F", "Gold futures"], ["CL=F", "Crude oil futures"], ["EURUSD=X", "EUR / USD"],
].map(([value, name]) => ({ value, label: `${value} \u2014 ${name}` }));

// Everything the layout engine and the editor need to know about this card type.
export const meta = {
  label: "Stock / Crypto Ticker",
  description: "Live price, daily change and a sparkline for any symbol.",
  size: {
    default: { col_span: 3, row_span: 2 },
    min: { col_span: 1, row_span: 1 }, // the card adapts to every size, see css/cards/ticker.css
  },
  minRefreshMs: 5000, // don't hammer the upstream API
  defaults: {
    refreshMs: 15000,
    params: { symbol: "AAPL", range: "7d", interval: "1h" },
  },
  // Describes `params` so the editor can build a form without knowing about tickers.
  params: {
    symbol: {
      type: "combobox",
      label: "Ticker",
      options: POPULAR,
      searchUrl: "/api/symbols?q={q}", // live search through the server
      allowCustom: true,
      uppercase: true,
      required: true,
    },
    range: { type: "select", label: "Range", options: ["1d", "5d", "7d", "1mo", "3mo", "6mo", "1y"] },
    interval: { type: "select", label: "Interval", options: ["5m", "15m", "30m", "1h", "1d"] },
  },
  summary: (card) => card.params?.symbol ?? "",
};

export function render(slots, cardData) {
  // Extract parameters from cardData.params as passed by newCardConfig
  const params = cardData.params || {};
  const symbol = params.symbol || "SP500-USD";
  const range = params.range || "7d";
  const interval = params.interval || "1h";

  const url =
    cardData.apiUrl ||
    `/api/stock?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(range)}&interval=${encodeURIComponent(interval)}`;

  // Visibility (visible / hidden / collapsed) is handled centrally by the card factory,
  // so slots only exist when they should be shown.
  if (slots.title) {
    // "Apple (AAPL)" when the card has its own title, just "AAPL" when it doesn't.
    if (cardData.title && cardData.title.toUpperCase() !== symbol.toUpperCase()) {
      slots.title.textContent = `${cardData.title} `;
      const tag = document.createElement("span");
      tag.className = "ticker-symbol";
      tag.textContent = `(${symbol})`;
      slots.title.append(tag);
    } else {
      slots.title.textContent = symbol;
    }
  }

  if (slots.subtitle) slots.subtitle.textContent = "Loading...";

  const wrapper = document.createElement("div");
  wrapper.className = "ticker-widget";
  wrapper.innerHTML = `
    <div class="ticker-header">
      <span class="ticker-price">--</span>
      <span class="ticker-change">--</span>
    </div>
    <svg class="ticker-sparkline" viewBox="0 0 200 60" preserveAspectRatio="none"></svg>
    <div class="ticker-range"></div>
  `;
  if (slots.main) slots.main.append(wrapper);

  const priceEl = wrapper.querySelector(".ticker-price");
  const changeEl = wrapper.querySelector(".ticker-change");
  const svgEl = wrapper.querySelector(".ticker-sparkline");
  const rangeEl = wrapper.querySelector(".ticker-range");

  const fit = fitText(priceEl, { container: wrapper.querySelector(".ticker-header") });

  let controller = new AbortController();

  async function updateTicker() {
    controller.abort();
    controller = new AbortController();

    try {
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) throw new Error(`Quote request failed (${res.status})`);
      const json = await res.json();

      const result = json?.chart?.result?.[0];
      if (!result) throw new Error("Invalid chart payload");

      const meta = result.meta;
      const closes = (result.indicators?.quote?.[0]?.close || []).filter(
        (n) => n != null,
      );

      // 1. Detect machine's currency (or allow cardData currency to override it)
      const sourceCurrency = meta.currency || "USD";
      const targetCurrency = cardData.currency || getLocalCurrency();
      const rate = await getExchangeRate(sourceCurrency, targetCurrency);

      // 2. Convert prices with robust fallbacks
      const fallbackPrice = closes[closes.length - 1] || 0;
      const price = (meta.regularMarketPrice ?? fallbackPrice) * rate;
      const prevClose =
        (meta.chartPreviousClose ||
          meta.previousClose ||
          meta.regularMarketPrice ||
          fallbackPrice) * rate;

      const dayLow = (meta.regularMarketDayLow ?? Math.min(...closes, fallbackPrice)) * rate;
      const dayHigh = (meta.regularMarketDayHigh ?? Math.max(...closes, fallbackPrice)) * rate;

      const pct =
        meta.regularMarketChangePercent ??
        (prevClose ? ((price - prevClose) / prevClose) * 100 : 0);
      const isUp = pct >= 0;

      // 3. Format using the browser's locale & target currency symbol
      const formatMoney = (val) =>
        val.toLocaleString(safeLocale(), {
          style: "currency",
          currency: targetCurrency,
        });

      priceEl.textContent = formatMoney(price);
      fit.update();
      changeEl.textContent = `${isUp ? "+" : ""}${pct.toFixed(2)}%`;
      changeEl.className = `ticker-change ${isUp ? "is-up" : "is-down"}`;
      wrapper.classList.toggle("is-down-trend", !isUp);

      rangeEl.textContent = `Day: ${formatMoney(dayLow)} - ${formatMoney(dayHigh)}`;

      // Update Subtitle to show Up / Down status
      if (slots.subtitle) {
        const sign = isUp ? "+" : "";
        slots.subtitle.textContent = `${isUp ? "Up" : "Down"} (${sign}${pct.toFixed(2)}%)`;
      }

      // 4. Draw SVG Sparkline from hourly close array
      drawSparkline(svgEl, closes, isUp);

      // 5. Update Footer with last market timestamp
      if (slots.footer && meta.regularMarketTime) {
        const marketDate = new Date(meta.regularMarketTime * 1000);
        slots.footer.textContent = `Last trade: ${marketDate.toLocaleTimeString(safeLocale())}`;
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error(`Ticker ${symbol}:`, err);
        priceEl.textContent = "Error";
        changeEl.textContent = "Failed to fetch";
        if (slots.subtitle) {
          slots.subtitle.textContent = "Unavailable";
        }
      }
    }
  }

  updateTicker();
  const timerId = setInterval(updateTicker, cardData.refreshMs || 15000);

  return () => {
    clearInterval(timerId);
    controller.abort();
    fit.destroy();
  };
}

// Converts an array of numbers into a responsive SVG polyline
function drawSparkline(svg, points, isUp) {
  if (!points || points.length < 2) return;

  const width = 200;
  const height = 60;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;

  const coords = points
    .map((val, i) => {
      const x = (i / (points.length - 1)) * width;
      const y = height - ((val - min) / span) * (height - 8) - 4; // 4px vertical padding
      return `${isNaN(x) ? 0 : x.toFixed(1)},${isNaN(y) ? height / 2 : y.toFixed(1)}`;
    })
    .join(" ");

  svg.innerHTML = `<polyline fill="none" stroke-width="2" points="${coords}" />`;
}