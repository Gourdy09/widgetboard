# Widgetboard

An offline-first wall dashboard for a Raspberry Pi Zero 2 W. One Go binary, 20 live tiles, and no cloud relays or VPN between you and your data.

> **Status: planning stage.** This README describes the intended design and the build roadmap. The sections marked *planned* are not implemented yet.

## Overview

Widgetboard turns a 32-inch 1080p monitor into an always-on wall display for personal finances, markets, your calendar, the weather, to-dos, deliveries, and the health of your home network. It is designed to run on very modest hardware (a Raspberry Pi Zero 2 W with 512 MB of RAM) and to keep all of your data on your own network.

Design goals:

- **Low memory.** A single compiled Go binary and a minimal kiosk stack, with the whole system targeting under 220 MB of RAM.
- **Offline and local.** Administration happens over your home network at `https://<your-name>.local`. No Tailscale, no hosted relay, no account to sign up for.
- **Secure by default.** Mutual TLS whitelists the devices that can administer it, and API keys are encrypted at rest.
- **Easy to set up.** One script on your PC generates certificates, encrypts your configuration, and deploys everything to the Pi over SSH.
- **Extensible.** Adding a widget or a data source means implementing one Go interface.

## Features

### The 20 tiles

**Personal finance**

- **Liquid Cash Balance.** Your true available cash (checking minus pending card charges), with a checking and savings breakdown.
- **Pending Credit Card Charges.** Pending authorizations, statement balance, and a color-coded credit utilization bar.
- **Upcoming Bills & Auto-Pay.** The name, amount, and days remaining for your next bill or auto-debit.
- **Total Portfolio.** Portfolio value, today's gain or loss in dollars and percent, and an intraday sparkline.
- **Market Session & Benchmark.** Open, pre-market, or closed, with a countdown to the next bell and SPY / QQQ performance.

**Watchlist (8 tiles)**

- **Stock / Crypto Tickers #1 to #8.** Symbol, live price, daily change badge, and a mini sparkline for each.

**Daily schedule and productivity**

- **Next Calendar Event.** Title, time, location or meeting-link label, and a live countdown, read from a private `.ics` feed.
- **Local Weather.** Current temperature, condition icon, daily high and low, and an alert banner if rain or snow is expected within two hours.
- **To-Do List.** Your top active tasks from the backend of your choice (see [Pluggable providers](#pluggable-providers)).
- **Package Tracker.** Incoming shipments by carrier, with their delivery status.

**System, network, and security**

- **Server Resource Monitor.** CPU load, RAM, temperature, and uptime for your home server or PC and for the Pi itself.
- **Network & Local Link Health.** WAN ping latency, Wi-Fi signal strength, and the status of the local hostname and firewall.
- **Security & Sync Telemetry.** How recently your financial feeds synced, whether the mTLS admin panel is locked, whether Stealth Mode is on, and a count of blocked unauthorized LAN access attempts.

### Stealth Mode

One toggle (and eventually a voice command) replaces every dollar figure on the wall with `$**,***`, so the display is safe to leave up when guests are over.

### Live layout editor

Open `http://<host>:8080/admin` and sign in (placeholder login: set `WIDGETBOARD_ADMIN_USER` / `WIDGETBOARD_ADMIN_PASS`, default `admin` / `admin`; real security comes later).

- **Layout tab.** Drag widgets from the palette onto the preview grid (or click one to drop it in the first free spot). Drag a block to move it and drag its bottom-right corner to resize it. Arrow keys move the selected block, Shift+arrows resize it, Delete removes it. Each block shows its ID, type and size. Click a block to edit it in the panel under the grid: ID (read-only), type, title/subtitle/footer, the card's own options (for a ticker: a searchable ticker dropdown), visibility of each element (visible / hidden but keeps its space / removed), position and size.
- **Grid size.** Columns and rows are set at the top of the Layout tab. The grid always fills the screen exactly, so nothing scrolls. Making the grid smaller moves and then shrinks cards to fit, and asks before removing any.
- **Theme tab.** Presets (Dark, Light, Midnight, Solarized, High contrast) plus every colour, spacing, corner radius, border, font, text size and shadow, with a live preview of the real dashboard.
- **Saving.** Nothing reaches the wall until you press *Save changes*; the wall picks it up within a few seconds. Unsaved edits are kept in the browser, so a reload or crash doesn't lose them, and the wall keeps a local copy of the last layout it loaded in case the server is unreachable at boot. The saved layout lives in `data/dashboard.json` (the `-data` flag or `WIDGETBOARD_DATA`; a Docker volume in `docker-compose.yml`) and is written atomically.

**How cards work.** Every card is built from the base card in `src/static/json/layout.json` (`id`, `type`, `title`, `subtitle`, `footer`, `apiUrl`, `refreshMs`, `col`, `row`, `col_span`, `row_span`, `params`, `config`), then the card type's defaults, then the card's own values. The whole dashboard is one document, `{ version, grid, theme, cards }`, served by `GET /api/layout` and saved by `PUT /api/layout` (sign-in required).

**Every size works.** A card is a CSS size container, so it adapts to the space it actually gets (1x1, 2x1, 1x2, 2x2, ...) instead of using hardcoded layouts per size: lower-priority parts drop out when there is no room, charts move beside the numbers on wide cards, and numbers shrink to fit (`utils/fitText.js`). Nothing overflows or scrolls. The layout engine (`core/layoutEngine.js`) guarantees no overlaps, nothing outside the grid and unique ids, no matter what is in the file.

**Adding a card type:**

```sh
cd src
go run ./cmd/newcard weather                 # type "weather"
go run ./cmd/newcard rss-feed "News Feed"    # type "rss-feed", label "News Feed"
```

This creates `static/js/cards/<name>Card.js` (size limits, defaults, editor fields, `render()`), `static/css/cards/<type>.css`, and registers the card in `cards/index.js`. Restart the server and the widget is in the admin palette. Fill in `meta` and `render()` and you're done.

**Tests:** `node --test src/test/*.test.mjs`

## Architecture

```text
 Data sources (Finnhub / Alpaca, SimpleFIN, Open-Meteo, .ics, Notion, ...)
                         |
                         v
        +----------------------------------+
        |  wallboard (single Go binary)    |
        |  - Provider per data source      |   encrypted config.json
        |  - layout.json + admin editor    |<--------------------------
        |  - SSE broadcaster  (/events)    |
        |  - HTTPS + mTLS on /admin, /api  |
        |  - embedded web assets (go:embed)|
        +----------------+-----------------+
                         | https://<name>.local
                         v
        cage (Wayland compositor) + cog (WPE WebKit)
                         |
                         v
              32-inch 1080p display
```

**One binary.** The whole frontend (HTML, CSS Grid, vanilla JS) is bundled into the Go executable with `//go:embed`. There is no Docker and no desktop environment on the Pi.

**Kiosk display.** Raspberry Pi OS Lite (64-bit) runs `cage`, a minimal Wayland compositor, with `cog`, a lightweight WPE WebKit browser, directly on the display. This is what keeps total system RAM small.

**Real-time updates.** Each widget is polled by its own goroutine. Updates are pushed to the browser over Server-Sent Events, which is simpler and lighter than WebSockets for one-way dashboard data.

**Service management.** A `systemd` unit starts the daemon on boot, restarts it on a crash, and enforces a memory limit (`MemoryMax=250M`).

### Pluggable providers

Every data source implements a small Go `Provider` interface. This is a design sketch, and the final signature may change:

```go
type Provider interface {
    Name() string
    // Poll fetches fresh data for one widget and returns it as a unified model.
    Poll(ctx context.Context) (Update, error)
}
```

The To-Do tile is built on a unified internal task model with swappable backends:

| Backend | How it connects |
|---|---|
| Notion | Polls a database through the official Notion REST API |
| Google Tasks | Google Tasks API, using OAuth2 refresh tokens |
| Apple Reminders | A local webhook, `POST /api/widgets/todo`, that receives synced reminders without any third-party cloud workaround |

**Adding a new widget** takes three steps: implement the `Provider` interface, add its credentials to `config.json`, and register the tile in `layout.json`.

### Tech stack

| Area | Technology |
|---|---|
| Language | Go (standard library: `net/http`, `crypto/tls`, `crypto/x509`, `encoding/json`) |
| Frontend | CSS Grid, vanilla JavaScript, `EventSource` (SSE) |
| OS and kiosk | Raspberry Pi OS Lite 64-bit, `cage`, `cog`, `systemd` |
| Discovery | mDNS through `avahi-daemon` (`<hostname>.local`) |
| Security | Local PKI (Root CA, server certificate, `.p12` client certificate), mutual TLS, AES-256-GCM, `ufw`, `gitleaks` |
| Build and release | Cross-compilation (`GOOS` / `GOARCH`), GitHub Actions |
| Optional later | Wyoming Satellite, openWakeWord, Faster-Whisper, Piper |

## Security Model

Widgetboard assumes your financial data should never leave your home network, and that nothing on your network should be trusted just because it is on your network.

- **100% offline, local-network access.** The dashboard and the admin panel are served at `https://<hostname>.local`, with `wallboard.local` as the default. There is no VPN, relay, or third-party coordination server.
- **Cryptographic whitelisting with mutual TLS.** `/admin` and all mutating `/api/*` routes require a client certificate (`tls.RequireAndVerifyClientCert`). Only devices holding the `.p12` certificate created during setup can connect. Every other device on the LAN is dropped during the TLS handshake, before any HTTP routing happens.
- **Local subnet firewall.** `ufw` rules restrict port 443 to your local subnet.
- **Encrypted secrets.** API keys and tokens are encrypted at rest in `config.json` with AES-256-GCM, using a master passphrase. `.gitignore` and `gitleaks` keep secrets out of the repository.
- **PC-side key generation.** The Root CA, the Pi's server certificate, and your client certificate are all generated on your own computer by the setup tool, not on the Pi.
- **Stealth Mode.** Masks sensitive dollar figures on the wall in real time.

### Renaming the device

The `.local` hostname can be chosen during setup and renamed later, either with the setup tool or from `/admin`. A rename updates the system hostname (`/etc/hostname`, `/etc/hosts`), restarts `avahi-daemon`, and re-issues the server certificate with the new `<name>.local` name under the existing Root CA. Because the client certificate is signed by that same CA, your browser keeps working without reinstalling anything.

## Setup (planned)

### Single-script setup from your PC

One interactive command on your PC or laptop (`cmd/setup`) does everything:

1. Asks for your Wi-Fi credentials, a custom `.local` hostname (default `wallboard`), your preferred to-do provider, your weather location, your API tokens, and a master encryption passphrase.
2. Generates a local Root CA, signs the Pi's server certificate with `<hostname>.local` as a Subject Alternative Name, and creates your browser's `.p12` client certificate.
3. Encrypts all API keys into `config.json` with AES-256-GCM.
4. Copies the `linux/arm64` binary, the encrypted config, and the certificates to the Pi over SSH, sets the hostname, and configures `systemd` so the Pi boots straight into the kiosk display with no further steps.

### Try it without a Pi

A `--demo` mode will run the full 20-tile dashboard on simulated data, inside a memory-capped Docker container, on Windows, macOS, or Linux:

```text
go run ./cmd/wallboard --demo
```

## Roadmap

### Phase 1: Local foundation and modular grid

Goal: a live, simulated 20-tile wallboard in a desktop browser, inside a 256 MB Docker container.

- Repository setup with `.gitignore`, MIT license, `Dockerfile`, and `docker-compose.yml`.
- Core Go server in `cmd/wallboard` that serves the embedded dashboard and admin pages.
- The `layout.json` schema (`id`, `type`, `title`, `col_span`, `row_span`, `config`).
- The 1080p dark-mode CSS Grid UI with an SSE broadcaster at `/events`.
- A `--demo` provider with simulated data for all 20 tiles.

### Phase 2: Admin editor, Stealth Mode, and renaming

Goal: edit the wall from a browser and rename the device on the fly.

- A mobile-friendly `/admin` page for tickers, to-dos, and grid slots.
- Atomic saves to `layout.json`, with an immediate SSE refresh of the wall.
- A global Stealth Mode toggle that masks currency values on every tile.
- Hostname renaming from `/admin` and from the CLI, which updates the system hostname and Avahi and re-signs the server certificate with the new name.

### Phase 3: Real data providers

Goal: replace the simulated data with real integrations.

- **Markets and crypto:** Finnhub or Alpaca for the 8 tickers, the SPY benchmark, and the market session status.
- **Banking:** SimpleFIN Bridge (or Plaid) for balances, pending charges, bills, and portfolio value.
- **Daily and operations:** Open-Meteo weather, an `.ics` calendar parser, a local system monitor, and a package tracking webhook.
- **To-do backends:** Notion, Google Tasks, and an Apple Reminders webhook receiver, documented along with the pattern for adding future API widgets.

### Phase 4: Security lockdown and single-script setup

Goal: protect personal financial data and make setup one command.

- PKI automation with Go `crypto/x509` (or an OpenSSL wrapper): Root CA, server certificate, and `.p12` client bundle.
- The `cmd/setup` tool: interactive prompts, certificate generation, AES-256-GCM encryption of `config.json`, and automatic deployment over SSH and SCP.
- mTLS enforcement on `/admin` and every mutating `/api/*` route.
- `ufw` local-subnet firewall rules.

### Phase 5: Raspberry Pi deployment and release

Goal: run on real hardware and publish v1.0.

- GitHub Actions that build `linux/arm64`, `linux/amd64`, and `windows/amd64` binaries on every tag, with `gitleaks` scanning on pushes.
- A one-line installer (`scripts/install.sh`) that installs `cage` and `cog`, `avahi-daemon`, `ufw`, and the `wallboard.service` unit, and sets up an auto-login kiosk boot.
- Flashing Raspberry Pi OS Lite, running the setup tool, and mounting the Pi behind the monitor.
- Documentation polish: architecture diagrams, security model write-up, `htop` RAM benchmarks (under 220 MB), and a demo GIF.

### Phase 6: Voice assistant satellite (future)

Goal: hands-free control with no commercial cloud services.

- A USB microphone and speaker on the Pi, running `wyoming-satellite` and `openWakeWord`.
- Post-wake-word audio streamed over the local network to Faster-Whisper on a home PC, with intents mapped to the Go REST API (`/api/todo`, `/api/stealth`, `/api/slot`) and confirmations spoken through Piper.

## Planned repository layout

```text
widgetboard/
├── cmd/
│   ├── wallboard/        # the dashboard server
│   └── setup/            # single-script PC provisioning tool
├── internal/
│   ├── providers/        # one package per data source
│   └── setup/            # PKI and encryption helpers
├── web/                  # dashboard and admin frontend (embedded)
├── scripts/
│   └── install.sh
├── .github/workflows/
│   └── release.yml
├── Dockerfile
└── docker-compose.yml
```

## License
MIT License
