# Hercules - Prediction Market Arbitrage Dashboard

A real-time dashboard for monitoring live prediction markets on [Fliq](https://fliq.one), with infrastructure for cross-platform arbitrage detection.

![Hercules Dashboard](https://img.shields.io/badge/Status-Active-brightgreen)
![React](https://img.shields.io/badge/React-18-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-5-blue)
![Vite](https://img.shields.io/badge/Vite-7-purple)

## Features

- **Live Market Monitoring** - Real-time fetching of active prediction markets from Fliq
- **Multi-Category Support** - Football, basketball, cricket, crypto, politics, and more
- **Smart Filtering** - Excludes rapid BTC/ETH markets and pass-related sports markets
- **Deduplication** - Groups multi-question markets to avoid duplicate entries
- **Time Formatting** - Intelligent display of remaining time (months, days, hours, minutes)
- **Direct Links** - Click any market to open it directly on Fliq
- **Polymarket Integration** - Infrastructure ready for cross-platform matching (coming soon)

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
- [ ] Polymarket market matching
- [ ] Arbitrage opportunity detection
- [ ] Orderbook visualization
- [ ] Trade execution interface
- [ ] Historical data analysis

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - see [LICENSE](LICENSE) for details.

---

Built with ⚡ by [ad714](https://github.com/ad714)
