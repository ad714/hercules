# Fliq Market Filters

This document lists all market types that are excluded from the Hercules dashboard.

## Excluded Categories

| Category | Reason |
|----------|--------|
| `5 min` | Rapid BTC/ETH price prediction markets |
| `15 min` | Rapid BTC/ETH price prediction markets |
| `up down` | BTC/ETH price direction markets |

## Excluded by Tags

Markets containing these tags are filtered out:
- `btc` - Bitcoin rapid markets
- `eth` - Ethereum rapid markets
- `5 min` - 5-minute prediction windows
- `15 min` - 15-minute prediction windows

## Excluded by Content (Keywords in Title)

Markets with these keywords in the title/header are excluded:
- `passes` - Football pass attempt markets (e.g., "attempt 420 or more passes")
- `pass against` - Similar pass-related markets

## Deduplication Rules

- Multi-question markets are deduplicated by `parentQuestionId`
- Only one entry per parent question is shown to avoid duplicate links

## Included Categories

ALL other categories are included:
- `football` - Football/Soccer matches
- `basketball` - Basketball (NBA, etc.)
- `cricket` - Cricket matches (World Cup, T20, etc.)
- `sports` - Other sports
- `crypto` - Crypto price predictions (non-rapid)
- `interest rates & markets` - Financial markets
- `tech & science` - Technology predictions
- `gossip` - Entertainment/Celebrity
- `other` - Miscellaneous

## Additional Filters

- Settled markets (`isSettled: true`) are excluded via API
- Markets without `questionEndTime` are excluded
- Markets with `questionEndTime` in the past are excluded

---

*Last updated: 2026-02-06*
