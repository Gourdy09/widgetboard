import { newCardConfig, createCard } from "./utils/cardFactory.js";

const grid = document.getElementById("dashboard-grid");

const layoutConfig = [
  // Row 1: Stocks, ETFs & Crypto
  newCardConfig({
    type: "ticker",
    apiUrl: "/api/stock?symbol=AAPL&range=7d&interval=1h",
    refreshMs: 15000,
    col: 1,
    row: 1,
    params: { symbol: "AAPL" }
  }),
  newCardConfig({
    type: "ticker",
    apiUrl: "/api/stock?symbol=VOO&range=7d&interval=1h",
    refreshMs: 15000,
    col: 4,
    row: 1,
    params: { symbol: "VOO" }
  }),
  newCardConfig({
    type: "ticker",
    apiUrl: "/api/stock?symbol=NVDA&range=7d&interval=1h",
    refreshMs: 15000,
    col: 7,
    row: 1,
    params: { symbol: "NVDA" }
  }),
  newCardConfig({
    type: "ticker",
    apiUrl: "/api/stock?symbol=BTC-USD&range=7d&interval=1h",
    refreshMs: 10000,
    col: 10,
    row: 1,
    params: { symbol: "BTC-USD" }
  }),
  // Row 2: Second Crypto Card
  newCardConfig({
    type: "ticker",
    apiUrl: "/api/stock?symbol=ETH-USD&range=7d&interval=1h",
    refreshMs: 10000,
    col: 1,
    row: 3,
    params: { symbol: "ETH-USD" }
  })
];

layoutConfig.forEach((cardData) => {
  grid.append(createCard(cardData));
});
