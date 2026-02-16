# Hercules - Prediction Market Arbitrage Dashboard

A real-time dashboard for monitoring live prediction markets on [Fliq](https://fliq.one), with infrastructure for cross-platform arbitrage detection.

![Hercules Dashboard](https://img.shields.io/badge/Status-Active-brightgreen)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Vite](https://img.shields.io/badge/Vite-7-purple)

## Features

- **Arb Terminal** - Dedicated view for cross-platform arbitrage detection between Fliq and Polymarket
- **AI Match Verification** - Uses Gemini 1.5 Flash to semanticly audit and confirm market pairings
- **Deep Scan Discovery** - Paged scan of 1,000+ Polymarket assets to find regular season games
- **Category Grouping** - Intelligent grouping of multi-question events into a single "Match" view
- **Smart Filtering** - Excludes noisy market types (Passes, Offsides, Player Transfers)
- **Centralized Knowledge** - Evolving brain of team synonyms and sport-specific guards
- **Direct Execution** - Integrated simulator for calculating ROI across platforms

## Tech Stack

- **Frontend**: React 18 + TypeScript
- **Build Tool**: Vite 7
- **Styling**: Vanilla CSS with modern dark theme
- **API**: Fliq REST API via Vite proxy

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

```bash
# Clone the repository
git clone https://github.com/ad714/hercules.git
cd hercules

# Install dependencies
npm install

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for Production

```bash
npm run build
npm run preview
```

## Project Structure

```
hercules/
├── src/
│   ├── App.tsx           # Main dashboard component
│   ├── main.tsx          # Entry point
│   ├── index.css         # Global styles
│   └── services/
│       ├── fliq.ts       # Fliq API integration
│       ├── poly.ts       # Polymarket API integration
│       └── matcher.ts    # Cross-platform matching logic
├── scripts/
│   ├── sync_markets.ts   # Market data sync script
│   └── match_markets.ts  # Market matching script
├── docs/
│   └── EXCLUDED_MARKETS.md  # Market filter documentation
└── vite.config.ts        # Vite configuration with API proxies
```

## Market Categories

The dashboard fetches and displays markets from the following categories:

| Category | Description |
|----------|-------------|
| Football | Soccer matches (EPL, La Liga, etc.) |
| Basketball | NBA and other leagues |
| Cricket | International and T20 matches |
| Crypto | Long-term crypto predictions |
| Sports | Other sports events |
| Gossip | Entertainment/Celebrity |
| Tech & Science | Technology predictions |
| Interest Rates & Markets | Financial market predictions |

## Excluded Markets

Certain market types are filtered out for a cleaner experience:

- **5 min / 15 min** - Rapid BTC/ETH price predictions
- **Up Down** - Short-term price direction markets
- **Pass markets** - Football pass attempt predictions

See [EXCLUDED_MARKETS.md](docs/EXCLUDED_MARKETS.md) for full details.

## API Configuration

The app uses Vite's proxy to bypass CORS restrictions:

| Endpoint | Target |
|----------|--------|
| `/api/fliq/*` | `https://auto-question.fliq.one` |
| `/api/fliq-dss/*` | `https://api-dss.fliq.one` |
| `/api/poly/*` | `https://gamma-api.polymarket.com` |
| `/api/poly-clob/*` | `https://clob.polymarket.com` |

## Roadmap

- [x] Live Fliq market fetching
- [x] Smart filtering and deduplication
- [x] Table view with sortable columns
- [x] Polymarket market matching (Deep Scan)
- [x] AI-Powered Arb Verification (Gemini)
- [x] Arbitrage opportunity detection
- [x] Orderbook visualization (Fliq side)
- [ ] Dual Orderbook Simulator (Poly + Fliq)
- [ ] Trade Execution (Paper Trading)
- [ ] Historical data analysis

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with ⚡ by [ad714](https://github.com/ad714)
