import { getLocalCurrency, getExchangeRate } from "../utils/currency.js";
export const type = "ticker";

export function render(slots, cardData) {
  // Extract parameters from cardData.params as passed by newCardConfig
  const params = cardData.params || {};
  const symbol = params.symbol || "SP500-USD";
  const range = params.range || "7d";
  const interval = params.interval || "1h";

  const url =
    cardData.apiUrl ||
    `/api/stock?symbol=${symbol}&range=${range}&interval=${interval}`;

  // Handle Title visibility and format: Title (grayed out small ticker)
  if (slots.title) {
    if (cardData.config?.title_visibility === "hidden") {
      slots.title.style.display = "none";
    } else {
      const mainTitle = cardData.title || symbol;
      const tickerSub = ` <span style="font-size: 0.75em; color: #888; font-weight: normal;">(${symbol})</span>`;
      slots.title.innerHTML = `${mainTitle}${tickerSub}`;
    }
  }

  // Handle Subtitle visibility
  if (slots.subtitle) {
    if (cardData.config?.subtitle_visibility === "hidden") {
      slots.subtitle.style.display = "none";
    } else {
      slots.subtitle.textContent = "Loading...";
    }
  }

  // Handle Main content visibility
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

  if (slots.main) {
    if (cardData.config?.main_visibility === "hidden") {
      wrapper.style.display = "none";
    }
    slots.main.append(wrapper);
  }

  // Handle Footer visibility
  if (slots.footer && cardData.config?.footer_visibility === "hidden") {
    slots.footer.style.display = "none";
  }

  const priceEl = wrapper.querySelector(".ticker-price");
  const changeEl = wrapper.querySelector(".ticker-change");
  const svgEl = wrapper.querySelector(".ticker-sparkline");
  const rangeEl = wrapper.querySelector(".ticker-range");

  let controller = new AbortController();

  async function updateTicker() {
    controller.abort();
    controller = new AbortController();

    try {
      const res = await fetch(url, { signal: controller.signal });
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
        val.toLocaleString(navigator.language, {
          style: "currency",
          currency: targetCurrency,
        });

      priceEl.textContent = formatMoney(price);
      changeEl.textContent = `${isUp ? "+" : ""}${pct.toFixed(2)}%`;
      changeEl.className = `stock-change ${isUp ? "is-up" : "is-down"}`;

      rangeEl.textContent = `Day: ${formatMoney(dayLow)} - ${formatMoney(dayHigh)}`;

      // Update Subtitle to show Up / Down status
      if (slots.subtitle && cardData.config?.subtitle_visibility !== "hidden") {
        const sign = isUp ? "+" : "";
        slots.subtitle.textContent = `${isUp ? "Up" : "Down"} (${sign}${pct.toFixed(2)}%)`;
      }

      // 4. Draw SVG Sparkline from hourly close array
      drawSparkline(svgEl, closes, isUp);

      // 5. Update Footer with last market timestamp
      if (slots.footer && cardData.config?.footer_visibility !== "hidden" && meta.regularMarketTime) {
        const marketDate = new Date(meta.regularMarketTime * 1000);
        slots.footer.textContent = `Last trade: ${marketDate.toLocaleTimeString()}`;
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        priceEl.textContent = "Error";
        changeEl.textContent = "Failed to fetch";
        if (slots.subtitle && cardData.config?.subtitle_visibility !== "hidden") {
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

  const strokeColor = isUp ? "#22c55e" : "#ef4444";
  svg.innerHTML = `<polyline fill="none" stroke="${strokeColor}" stroke-width="2" points="${coords}" />`;
}