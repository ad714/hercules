import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchFliqQuestions, fetchFliqOrderbook, filterFliqMatches, type FliqQuestion, type FliqOrderbookLevel } from './services/fliq';


type LiquidityLevel = 'NONE' | 'LOW' | 'MED' | 'HIGH';

const CategoryIcon = ({ category, style }: { category: string; style?: React.CSSProperties }) => {
  const cat = category.toLowerCase();

  const iconStyle = { ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#21262d', borderRadius: '8px', color: '#8b949e' };

  if (cat.includes('football')) {
    return (
      <div style={iconStyle}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="m12 12-4 3" /><path d="m12 12 4 3" /><path d="m12 12v-5" /><path d="m12 7 4-2" /><path d="m12 7-4-2" /><path d="m8 15-2 1" /><path d="m16 15 2 1" /></svg>
      </div>
    );
  }
  if (cat.includes('up down') || cat.includes('crypto') || cat.includes('bitcoin')) {
    return (
      <div style={iconStyle}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>
      </div>
    );
  }
  if (cat.includes('basketball')) {
    return (
      <div style={iconStyle}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M4.93 4.93c2.76 2.76 2.76 7.24 0 10" /><path d="M19.07 4.93c-2.76 2.76-2.76 7.24 0 10" /><path d="M12 2v20" /><path d="M2 12h20" /></svg>
      </div>
    );
  }
  return (
    <div style={iconStyle}>
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
    </div>
  );
};

export default function App() {
  const [loading, setLoading] = useState(true);
  const [allQuestions, setAllQuestions] = useState<FliqQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMarket, setSelectedMarket] = useState<FliqQuestion | null>(null);
  const [orderbook, setOrderbook] = useState<{ yes: FliqOrderbookLevel[], no: FliqOrderbookLevel[] }>({ yes: [], no: [] });
  const [obLoading, setObLoading] = useState(false);
  const [liquidityCache, setLiquidityCache] = useState<Record<string, LiquidityLevel>>({});
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

  // Fliq state model: Side (Add/Exit) and Outcome (Yes/No)
  const [tradeOutcome, setTradeOutcome] = useState<'yes' | 'no'>('yes');
  const [tradeSide, setTradeSide] = useState<'add' | 'exit'>('add');
  const [orderbookTab, setOrderbookTab] = useState<'yes' | 'no'>('yes');

  const [tradeQty, setTradeQty] = useState(10);
  const [tradePrice, setTradePrice] = useState('0.500');
  const [tradeAmount, setTradeAmount] = useState('10');
  const [tradeMode, setTradeMode] = useState<'limit' | 'instant'>('instant');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Calculate liquidity level based on orderbook depth
  const calculateLiquidity = (levels: FliqOrderbookLevel[]): LiquidityLevel => {
    if (levels.length === 0) return 'NONE';
    const totalSize = levels.reduce((sum, l) => sum + l.total_size, 0);
    if (totalSize < 500) return 'LOW';
    if (totalSize < 2000) return 'MED';
    return 'HIGH';
  };

  // Format time left until market ends
  const formatTimeLeft = (endTs: number) => {
    const now = Date.now() / 1000;
    const diff = endTs - now;
    if (diff <= 0) return 'ENDED';
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins} mins`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hrs`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  };

  // Initial Data Load
  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const fliqRaw = await fetchFliqQuestions(5000);

      const filtered = filterFliqMatches(fliqRaw);

      setAllQuestions(filtered);

      if (filtered.length > 0 && !selectedMarket) {
        setSelectedMarket(filtered[0]);
      }

      prefetchLiquidity(filtered.slice(0, 30));
    } catch (e: any) {
      setError(e.message || 'Failed to fetch Fliq markets');
    } finally {
      setLoading(false);
    }
  };

  const prefetchLiquidity = async (markets: FliqQuestion[]) => {
    const updates: Record<string, LiquidityLevel> = {};
    await Promise.allSettled(markets.map(async (m) => {
      try {
        const levels = await fetchFliqOrderbook(m.yesTokenMarketId);
        updates[m.questionId] = calculateLiquidity(levels);
      } catch {
        updates[m.questionId] = 'NONE';
      }
    }));
    setLiquidityCache(prev => ({ ...prev, ...updates }));
  };

  useEffect(() => { loadData(); }, []);

  const refreshOrderbook = useCallback(async (market: FliqQuestion) => {
    if (obLoading) return;
    setLastUpdated(new Date()); // Update timestamp instantly on call
    setObLoading(true);
    try {
      const [yesLevels, noLevels] = await Promise.all([
        fetchFliqOrderbook(market.yesTokenMarketId),
        fetchFliqOrderbook(market.noTokenMarketId)
      ]);
      setOrderbook({ yes: yesLevels, no: noLevels });

      // Smart Polling: If market is illiquid, disable auto-refresh to save resources
      if (yesLevels.length === 0 && noLevels.length === 0) {
        setAutoRefresh(false);
      }

      setLiquidityCache(prev => ({
        ...prev,
        [market.questionId]: calculateLiquidity([...yesLevels, ...noLevels])
      }));
    } catch (e) {
      console.error('OB Fetch Failed', e);
    } finally {
      setObLoading(false);
    }
  }, [obLoading]);

  useEffect(() => {
    if (!selectedMarket) return;
    if (pollingRef.current) clearInterval(pollingRef.current);

    // Clear previous data to show loader immediately
    setOrderbook({ yes: [], no: [] });
    setLastUpdated(null);

    refreshOrderbook(selectedMarket);

    if (autoRefresh) {
      pollingRef.current = setInterval(() => refreshOrderbook(selectedMarket), 2000);
    }

    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, [selectedMarket, autoRefresh]);

  // Group questions by parent - but ALSO include standalone single questions
  const groupedMarkets = useMemo(() => {
    type MarketGroup = {
      parent: FliqQuestion | null;
      parentHeader: string;
      subQuestions: FliqQuestion[];
      bestLiquidity: LiquidityLevel;
      endTime: number;
    };

    const groups: Record<string, MarketGroup> = {};
    allQuestions.forEach(q => {
      const bm = q.blockchainMetadata;
      const parentId = bm.parentQuestionId || q.questionId;
      const parentHeader = bm.parentQuestionHeader || bm.questionHeader;
      const endTs = parseInt(bm.questionEndTime || '0');

      if (!groups[parentId]) {
        groups[parentId] = {
          parent: bm.parentQuestionId ? null : q,
          parentHeader,
          subQuestions: [],
          bestLiquidity: 'NONE',
          endTime: endTs
        };
      }

      if (bm.parentQuestionId) {
        groups[parentId].subQuestions.push(q);
      } else {
        groups[parentId].parent = q;
      }

      const liq = liquidityCache[q.questionId];
      if (liq === 'HIGH' || (liq === 'MED' && groups[parentId].bestLiquidity !== 'HIGH')) {
        groups[parentId].bestLiquidity = liq;
      } else if (liq === 'LOW' && groups[parentId].bestLiquidity === 'NONE') {
        groups[parentId].bestLiquidity = liq;
      }
      groups[parentId].endTime = Math.min(groups[parentId].endTime || endTs, endTs);
    });

    // Sort by end time (soonest first)
    return Object.values(groups)
      .filter(g => g.subQuestions.length > 0 || g.parent)
      .sort((a, b) => a.endTime - b.endTime);
  }, [allQuestions, liquidityCache]);

  const filteredGroups = useMemo(() => {
    if (!searchQuery) return groupedMarkets;
    const q = searchQuery.toLowerCase();
    return groupedMarkets.filter(g =>
      g.parentHeader.toLowerCase().includes(q) ||
      g.subQuestions.some(sq => sq.blockchainMetadata.questionHeader.toLowerCase().includes(q))
    );
  }, [groupedMarkets, searchQuery]);

  // Orderbook formatting - matching Fliq UI exactly
  const formatPrice = (p: number) => `${(p / 1000).toFixed(3)}$`;
  const formatQty = (s: number) => s.toFixed(2);

  const getLiquidityBadge = (level: LiquidityLevel) => {
    const s = {
      HIGH: { color: '#00ba7c', label: '●●●' },
      MED: { color: '#ffd700', label: '●●○' },
      LOW: { color: '#f91880', label: '●○○' },
      NONE: { color: '#38444d', label: '○○○' }
    }[level];
    return <span style={{ color: s.color, fontSize: '0.6rem', fontWeight: 900, letterSpacing: '1px' }}>{s.label}</span>;
  };

  const lotSizeScaling = useMemo(() => {
    if (!selectedMarket) return 0.01;
    const lotSize = parseFloat(selectedMarket.lotSize) || 10000;
    const decimal = typeof selectedMarket.decimal === 'string' ? parseInt(selectedMarket.decimal) : (selectedMarket.decimal || 6);
    return lotSize / Math.pow(10, decimal);
  }, [selectedMarket]);

  // Fliq-style aggregation: A bid on 'No' at $0.20 is an ask on 'Yes' at $0.80
  const { bids, asks } = useMemo(() => {
    // Simplified aggregation: Bids of one outcome are Asks of the other
    const yesBids = orderbook.yes.filter(l => l.direction === 'bid').map(l => ({ ...l, total_size: l.total_size * lotSizeScaling }));
    const noBids = orderbook.no.filter(l => l.direction === 'bid').map(l => ({ ...l, total_size: l.total_size * lotSizeScaling }));

    if (orderbookTab === 'yes') {
      return {
        bids: yesBids.sort((a, b) => b.price - a.price),
        asks: noBids.map(l => ({ ...l, price: 1000 - l.price, direction: 'ask' as const }))
          .sort((a, b) => a.price - b.price)
      };
    } else {
      return {
        bids: noBids.sort((a, b) => b.price - a.price),
        asks: yesBids.map(l => ({ ...l, price: 1000 - l.price, direction: 'ask' as const }))
          .sort((a, b) => a.price - b.price)
      };
    }
  }, [orderbookTab, orderbook.yes, orderbook.no, lotSizeScaling]);

  // Calculate cumulative sizes for the orderbook display (Fliq Style)
  const bidsWithCumulative = useMemo(() => {
    let sum = 0;
    return bids.map(l => {
      sum += (l.price / 1000) * l.total_size;
      return { ...l, cumulativeAmount: sum };
    });
  }, [bids]);

  const asksWithCumulative = useMemo(() => {
    let sum = 0;
    // For asks, we start cumulative sum from the best (lowest) price
    const sortedAsks = [...asks].sort((a, b) => a.price - b.price);
    const withCum = sortedAsks.map(l => {
      sum += (l.price / 1000) * l.total_size;
      return { ...l, cumulativeAmount: sum };
    });
    // Return in reverse (highest price at top) for the UI mapping
    return withCum.sort((a, b) => b.price - a.price);
  }, [asks]);

  // Max value for scaling volume bars (use cumulativeAmount for monotonic Bars like Fliq)
  const maxSize = useMemo(() => {
    const all = [...bidsWithCumulative, ...asksWithCumulative];
    if (all.length === 0) return 1;
    return Math.max(...all.map(l => l.cumulativeAmount), 0.1);
  }, [bidsWithCumulative, asksWithCumulative]);

  const spread = bids[0] && asks[0] ? `$${((asks[0].price - bids[0].price) / 1000).toFixed(3)}` : 'N/A';
  const lastPriceValue = bids[0] ? bids[0].price / 1000 : 0.500;
  const lastPrice = `$${lastPriceValue.toFixed(3)}`;

  // Automatically update trade price if not manually edited
  useEffect(() => {
    const sideBook = tradeOutcome === 'yes' ? orderbook.yes : orderbook.no;
    const topAsk = sideBook.find(l => l.direction === 'ask');
    if (topAsk) {
      setTradePrice((topAsk.price / 1000).toFixed(3));
    } else {
      // If no asks, use LTP or default
      const bids = sideBook.filter(l => l.direction === 'bid').sort((a, b) => b.price - a.price);
      if (bids[0]) {
        // Fallback: price slightly above best bid
        setTradePrice(Math.min(0.999, (bids[0].price / 1000) + 0.05).toFixed(3));
      } else {
        setTradePrice('0.500');
      }
    }
  }, [selectedMarket?.questionId, tradeOutcome, orderbook.yes.length, orderbook.no.length]);

  // Order Breakdown Calculation (Fliq "Instant" style)
  const breakdown = useMemo(() => {
    const sideBook = tradeOutcome === 'yes' ? orderbook.yes : orderbook.no;
    const sideAsks = sideBook.filter(l => l.direction === 'ask').sort((a, b) => a.price - b.price);

    let filledQty = 0;
    let totalCost = 0;
    let avgPrice = 0;

    if (tradeMode === 'instant') {
      let remainingCash = parseFloat(tradeAmount) || 0;
      for (const level of sideAsks) {
        const levelPrice = level.price / 1000;
        const levelMaxCash = level.total_size * levelPrice;
        const fillCash = Math.min(remainingCash, levelMaxCash);

        filledQty += fillCash / levelPrice;
        totalCost += fillCash;
        remainingCash -= fillCash;
        if (remainingCash <= 0) break;
      }
      // Slippage Simulation: If book is thin or empty, remaining is filled at increasingly worse prices
      if (remainingCash > 0) {
        const basePrice = sideAsks.length > 0 ? (sideAsks[sideAsks.length - 1].price / 1000) : (parseFloat(tradePrice) || 0.5);

        // Ghost Slippage: Simulation of depth impact even beyond visible orders
        // As amount increases (e.g. past $10), price moves towards $1.00
        const volumeImpact = Math.min(0.5, remainingCash / 5000); // Max 50% extra slippage at $5k
        const slippagePrice = Math.min(0.999, basePrice + (1 - basePrice) * (0.1 + volumeImpact));

        filledQty += remainingCash / slippagePrice;
        totalCost += remainingCash;
      }
      avgPrice = filledQty > 0 ? totalCost / filledQty : 0;
    } else {
      // Limit Mode
      filledQty = tradeQty;
      avgPrice = parseFloat(tradePrice) || 0.5;
      totalCost = filledQty * avgPrice;
    }

    const takerFeeRate = 0.0005; // 0.05% (5 bps) as per Econia/Fliq docs
    const fee = tradeMode === 'instant' ? (totalCost * takerFeeRate) : 0;

    const potPayoutNoFee = filledQty * 1.0;
    const netProfitBeforeTax = potPayoutNoFee - totalCost - fee;

    // Fliq Platform Fee: 10% on Net Profits (only if winning)
    const winFee = netProfitBeforeTax > 0 ? netProfitBeforeTax * 0.1 : 0;
    const potProfit = netProfitBeforeTax - winFee;
    const roi = totalCost > 0 ? (potProfit / totalCost) * 100 : 0;

    return {
      avgPrice,
      qty: filledQty,
      cost: totalCost,
      fee,
      potProfit,
      roi
    };
  }, [tradeQty, tradePrice, tradeAmount, tradeSide, tradeMode, orderbook]);

  const selectedParentGroup = selectedMarket ? groupedMarkets.find(g =>
    g.subQuestions.some(sq => sq.questionId === selectedMarket.questionId) ||
    g.parent?.questionId === selectedMarket.questionId
  ) : null;

  // Get end time for selected market
  const selectedEndTime = selectedMarket ? parseInt(selectedMarket.blockchainMetadata.questionEndTime || '0') : 0;

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      background: '#0d1117',
      color: '#ffffff',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      overflow: 'hidden'
    }}>
      {/* LEFT: Explorer */}
      <div style={{ width: '420px', display: 'flex', flexDirection: 'column', borderRight: '1px solid #21262d' }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #21262d', background: '#161b22' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <h1 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#58a6ff' }}>HERCULES</h1>
            <div style={{ fontSize: '0.7rem', color: '#8b949e' }}>{allQuestions.length} markets</div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <input
              placeholder="Search markets..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                flex: 1, padding: '8px 12px', background: '#0d1117', border: '1px solid #30363d', borderRadius: '6px',
                color: '#fff', fontSize: '0.85rem', outline: 'none'
              }}
            />
            <button onClick={loadData} style={{ background: '#238636', color: '#fff', border: 'none', borderRadius: '6px', padding: '0 16px', fontWeight: 600, cursor: 'pointer' }}>
              {loading ? '...' : 'SYNC'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ padding: '8px 16px', background: '#f8514922', color: '#f85149', fontSize: '0.8rem' }}>
            Error: {error}
          </div>
        )}

        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          {/* Initial Loading State */}
          {loading && allQuestions.length === 0 && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              height: '200px', color: '#8b949e'
            }}>
              <div style={{
                width: '32px', height: '32px', border: '3px solid #21262d',
                borderTopColor: '#58a6ff', borderRadius: '50%',
                animation: 'spin 1s linear infinite'
              }} />
              <div style={{ marginTop: '12px', fontSize: '0.8rem' }}>Loading markets...</div>
            </div>
          )}

          {filteredGroups.map((group) => {
            const parentId = group.parent?.questionId || group.subQuestions[0]?.blockchainMetadata.parentQuestionId;
            const isExpanded = expandedParents[parentId || ''] ?? true;
            const hasSubs = group.subQuestions.length > 0;
            const timeLeft = formatTimeLeft(group.endTime);

            return (
              <div key={parentId || group.parentHeader} style={{ borderBottom: '1px solid #21262d' }}>
                {/* Parent Header Row */}
                <div
                  onClick={() => {
                    if (hasSubs) {
                      setExpandedParents(p => ({ ...p, [parentId || '']: !isExpanded }));
                    } else if (group.parent) {
                      setSelectedMarket(group.parent);
                    }
                  }}
                  style={{
                    padding: '10px 12px', cursor: 'pointer', background: '#0d1117',
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}
                >
                  <div style={{ width: '28px', height: '28px', position: 'relative', overflow: 'hidden', borderRadius: '4px' }}>
                    <img
                      src={group.parent?.blockchainMetadata.imgUrl}
                      style={{ width: '28px', height: '28px', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
                      alt=""
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                    <CategoryIcon
                      category={group.parent?.category || ''}
                      style={{ width: '28px', height: '28px', position: 'absolute', top: 0, left: 0, zIndex: 0 }}
                    />
                  </div>
                  <span style={{
                    padding: '2px 5px', background: hasSubs ? '#238636' : '#1f6feb', color: '#fff',
                    fontSize: '0.55rem', fontWeight: 700, borderRadius: '3px'
                  }}>
                    {hasSubs ? 'M' : 'S'}
                  </span>
                  <span style={{
                    flex: 1, fontSize: '0.8rem', fontWeight: 600,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    color: (group.parent && selectedMarket?.questionId === group.parent.questionId) ? '#58a6ff' : '#c9d1d9'
                  }}>
                    {group.parentHeader}
                  </span>
                  {/* Timer Badge */}
                  <span style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '2px 6px', background: '#21262d', borderRadius: '4px',
                    fontSize: '0.65rem', color: '#f0883e'
                  }}>
                    ⏱ {timeLeft}
                  </span>
                  {getLiquidityBadge(group.bestLiquidity)}
                </div>

                {/* Sub-questions (only for multi-question markets) */}
                {hasSubs && isExpanded && (
                  <div style={{ background: '#161b22' }}>
                    {group.subQuestions.map(sq => {
                      const sqEndTime = parseInt(sq.blockchainMetadata.questionEndTime || '0');
                      const sqTimeLeft = formatTimeLeft(sqEndTime);
                      const isSelected = selectedMarket?.questionId === sq.questionId;

                      return (
                        <div
                          key={sq.questionId}
                          onClick={() => setSelectedMarket(sq)}
                          style={{
                            padding: '8px 12px 8px 16px', cursor: 'pointer',
                            background: isSelected ? '#1f6feb22' : 'transparent',
                            borderLeft: `2px solid ${isSelected ? '#58a6ff' : 'transparent'}`,
                            display: 'flex', alignItems: 'center', gap: '8px'
                          }}
                        >
                          <div style={{ width: '24px', height: '24px', position: 'relative', overflow: 'hidden', borderRadius: '4px' }}>
                            <img
                              src={sq.blockchainMetadata.imgUrl}
                              style={{ width: '24px', height: '24px', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
                              alt=""
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                            <CategoryIcon
                              category={sq.category}
                              style={{ width: '24px', height: '24px', position: 'absolute', top: 0, left: 0, zIndex: 0 }}
                            />
                          </div>
                          {getLiquidityBadge(liquidityCache[sq.questionId] || 'NONE')}
                          <span style={{ flex: 1, fontSize: '0.75rem', color: isSelected ? '#58a6ff' : '#8b949e' }}>
                            {sq.blockchainMetadata.questionHeader}
                          </span>
                          <span style={{ fontSize: '0.6rem', color: '#f0883e' }}>⏱ {sqTimeLeft}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* RIGHT: OrderBook Panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#0d1117' }}>
        {selectedMarket ? (
          <>
            {/* Market Header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #21262d', background: '#161b22' }}>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                <div style={{ width: '48px', height: '48px', position: 'relative' }}>
                  <img
                    src={selectedMarket.blockchainMetadata.imgUrl}
                    style={{ width: '48px', height: '48px', borderRadius: '8px', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
                    alt=""
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />
                  <CategoryIcon category={selectedMarket.category} style={{ width: '48px', height: '48px', position: 'absolute', top: 0, left: 0, zIndex: 0 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' }}>
                    <span style={{ fontSize: '0.7rem', color: '#58a6ff', fontWeight: 600 }}>{selectedMarket.category}</span>
                    <span style={{ fontSize: '0.65rem', color: '#8b949e' }}>ID: {selectedMarket.questionId}</span>
                    <span style={{ fontSize: '0.65rem', color: '#8b949e', marginLeft: '8px' }}>Vol: {(selectedMarket.totalVolume || 0).toLocaleString()}</span>
                    <span style={{ fontSize: '0.65rem', color: '#238636', marginLeft: '4px' }}>24h: {(selectedMarket.quoteVol24h || 0).toLocaleString()}$</span>
                    <span style={{
                      marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px',
                      padding: '3px 8px', background: '#f0883e22', borderRadius: '4px',
                      fontSize: '0.7rem', color: '#f0883e', fontWeight: 600
                    }}>
                      ⏱ {formatTimeLeft(selectedEndTime)}
                    </span>
                  </div>
                  <h2 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#c9d1d9' }}>
                    {selectedMarket.blockchainMetadata.questionHeader}
                  </h2>
                  {selectedParentGroup && selectedParentGroup.parentHeader !== selectedMarket.blockchainMetadata.questionHeader && (
                    <div style={{ fontSize: '0.75rem', color: '#8b949e', marginTop: '2px' }}>{selectedParentGroup.parentHeader}</div>
                  )}
                </div>
              </div>
            </div>

            {/* Main Content: OrderBook + Trade Widget */}
            <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 320px', overflow: 'hidden' }}>
              {/* LEFT: OrderBook */}
              <div style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid #21262d' }}>
                {/* Trade Tabs (Using new orderbookTab state) */}
                <div style={{ display: 'flex', borderBottom: '1px solid #21262d', background: '#0d1117' }}>
                  <div
                    onClick={() => setOrderbookTab('yes')}
                    style={{
                      flex: 1, padding: '14px', textAlign: 'center', cursor: 'pointer',
                      fontSize: '0.85rem', fontWeight: 800,
                      color: orderbookTab === 'yes' ? '#00ba7c' : '#8b949e',
                      borderBottom: orderbookTab === 'yes' ? '2px solid #00ba7c' : 'none'
                    }}
                  >Trade Yes</div>
                  <div
                    onClick={() => setOrderbookTab('no')}
                    style={{
                      flex: 1, padding: '14px', textAlign: 'center', cursor: 'pointer',
                      fontSize: '0.85rem', fontWeight: 800,
                      color: orderbookTab === 'no' ? '#58a6ff' : '#8b949e',
                      borderBottom: orderbookTab === 'no' ? '2px solid #58a6ff' : 'none'
                    }}
                  >Trade No</div>
                </div>

                {/* Status Bar */}
                <div style={{
                  padding: '8px 16px', background: '#0d1117', borderBottom: '1px solid #21262d',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div
                      onClick={() => setAutoRefresh(!autoRefresh)}
                      style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}
                    >
                      <div style={{
                        width: '32px', height: '16px', background: autoRefresh ? '#238636' : '#30363d',
                        borderRadius: '8px', position: 'relative', transition: '0.2s'
                      }}>
                        <div style={{
                          width: '12px', height: '12px', background: '#fff', borderRadius: '50%',
                          position: 'absolute', top: '2px', left: autoRefresh ? '18px' : '2px', transition: '0.2s'
                        }} />
                      </div>
                      <span style={{ fontSize: '0.7rem', color: '#8b949e', fontWeight: 600 }}>Auto-Refresh</span>
                    </div>
                    {lastUpdated && (
                      <span style={{ fontSize: '0.65rem', color: '#8b949e' }}>
                        Last: {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      </span>
                    )}
                  </div>
                  {!autoRefresh && (
                    <button
                      onClick={() => {
                        setLastUpdated(new Date()); // Instant feedback on click
                        refreshOrderbook(selectedMarket);
                      }}
                      style={{
                        background: '#21262d', border: 'none', color: '#58a6ff',
                        fontSize: '0.7rem', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer'
                      }}
                    >
                      Refresh Now
                    </button>
                  )}
                </div>

                {/* OrderBook Header Table */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '70px 1fr 70px 90px',
                  padding: '8px 16px', fontSize: '0.7rem', color: '#8b949e', fontWeight: 600,
                  borderBottom: '1px solid #21262d', background: '#161b22'
                }}>
                  <div>Volume</div>
                  <div style={{ textAlign: 'center' }}>Price</div>
                  <div style={{ textAlign: 'center' }}>Qty</div>
                  <div style={{ textAlign: 'right' }}>Amount</div>
                </div>

                {/* OrderBook Content */}
                <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
                  {/* Loading Overlay */}
                  {obLoading && asks.length === 0 && bids.length === 0 && (
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      background: '#0d1117', zIndex: 10
                    }}>
                      <div style={{
                        width: '32px', height: '32px', border: '3px solid #21262d',
                        borderTopColor: '#58a6ff', borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                      }} />
                      <div style={{ marginTop: '12px', color: '#8b949e', fontSize: '0.8rem' }}>Loading orderbook...</div>
                    </div>
                  )}

                  {/* No Data State */}
                  {!obLoading && asks.length === 0 && bids.length === 0 && (
                    <div style={{
                      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                      height: '100%', color: '#8b949e', fontSize: '0.85rem', padding: '40px 16px', textAlign: 'center'
                    }}>
                      <div style={{ fontSize: '2rem', marginBottom: '12px' }}>📊</div>
                      <div style={{ fontWeight: 600, color: '#c9d1d9' }}>No Limit Orders Yet</div>
                      <div style={{ fontSize: '0.75rem', marginTop: '4px' }}>Polling paused due to zero volume</div>
                      <button
                        onClick={() => { setAutoRefresh(true); refreshOrderbook(selectedMarket); }}
                        style={{
                          marginTop: '16px', background: '#238636', color: '#fff', border: 'none',
                          padding: '8px 16px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer'
                        }}
                      >
                        Resume Polling
                      </button>
                    </div>
                  )}

                  {/* ASKS (Blue / Sells) - Highest price top */}
                  {asksWithCumulative.map((l, i) => {
                    const volumePercent = (l.cumulativeAmount / maxSize) * 100;
                    return (
                      <div key={`ask-${i}`} style={{
                        display: 'grid', gridTemplateColumns: '70px 1fr 70px 90px',
                        padding: '6px 16px', fontSize: '0.8rem', position: 'relative', borderBottom: '1px solid #21262d05'
                      }}>
                        <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
                          <div style={{
                            position: 'absolute', right: 0, top: '4px', bottom: '4px',
                            width: `${volumePercent}%`, background: '#388bfd33', borderRadius: '1px'
                          }} />
                        </div>
                        <div style={{ textAlign: 'center', color: '#58a6ff', fontWeight: 600 }}>{formatPrice(l.price)}</div>
                        <div style={{ textAlign: 'center', color: '#c9d1d9' }}>{formatQty(l.total_size)}</div>
                        <div style={{ textAlign: 'right', color: '#58a6ff', fontWeight: 500 }}>{l.cumulativeAmount.toFixed(4)}$</div>
                      </div>
                    );
                  })}

                  <div style={{
                    padding: '8px 16px', background: '#161b22', borderBlock: '1px solid #21262d',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: '0.75rem', fontWeight: 700
                  }}>
                    <span style={{ color: '#8b949e' }}>Spread: {spread}</span>
                    <span style={{ color: '#c9d1d9' }}>LTP: {lastPrice}</span>
                  </div>

                  {/* BIDS (Green / Buys) - Highest price top */}
                  {bidsWithCumulative.map((l, i) => {
                    const volumePercent = (l.cumulativeAmount / maxSize) * 100;
                    return (
                      <div key={`bid-${i}`} style={{
                        display: 'grid', gridTemplateColumns: '70px 1fr 70px 90px',
                        padding: '6px 16px', fontSize: '0.8rem', position: 'relative', borderBottom: '1px solid #21262d05'
                      }}>
                        <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
                          <div style={{
                            position: 'absolute', right: 0, top: '4px', bottom: '4px',
                            width: `${volumePercent}%`, background: '#00ba7c33', borderRadius: '1px'
                          }} />
                        </div>
                        <div style={{ textAlign: 'center', color: '#00ba7c', fontWeight: 600 }}>{formatPrice(l.price)}</div>
                        <div style={{ textAlign: 'center', color: '#c9d1d9' }}>{formatQty(l.total_size)}</div>
                        <div style={{ textAlign: 'right', color: '#00ba7c', fontWeight: 500 }}>{l.cumulativeAmount.toFixed(4)}$</div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* RIGHT: Trade Widget */}
              <div style={{ display: 'flex', flexDirection: 'column', background: '#111418', padding: '16px', gap: '16px' }}>
                {/* Mode Tabs */}
                <div style={{ display: 'flex', gap: '4px', background: '#0d1117', padding: '4px', borderRadius: '10px' }}>
                  <button
                    onClick={() => setTradeSide('add')}
                    style={{
                      flex: 1, padding: '8px', borderRadius: '8px', border: 'none', fontSize: '0.75rem', fontWeight: 700,
                      background: tradeSide === 'add' ? '#21262d' : 'transparent',
                      color: tradeSide === 'add' ? '#fff' : '#8b949e', cursor: 'pointer'
                    }}
                  >Add</button>
                  <button
                    onClick={() => setTradeSide('exit')}
                    style={{
                      flex: 1, padding: '8px', borderRadius: '8px', border: 'none', fontSize: '0.75rem', fontWeight: 700,
                      background: tradeSide === 'exit' ? '#21262d' : 'transparent',
                      color: tradeSide === 'exit' ? '#fff' : '#8b949e', cursor: 'pointer'
                    }}
                  >Exit</button>
                  <div style={{ width: '1px', background: '#30363d', margin: '4px 0' }} />
                  <button
                    onClick={() => setTradeMode('limit')}
                    style={{
                      flex: 1, padding: '8px', borderRadius: '8px', border: 'none', fontSize: '0.75rem', fontWeight: 700,
                      background: tradeMode === 'limit' ? '#21262d' : 'transparent',
                      color: tradeMode === 'limit' ? '#fff' : '#8b949e', cursor: 'pointer'
                    }}
                  >Set Price</button>
                  <button
                    onClick={() => setTradeMode('instant')}
                    style={{
                      flex: 2, padding: '8px', borderRadius: '8px', border: 'none', fontSize: '0.75rem', fontWeight: 700,
                      background: tradeMode === 'instant' ? '#21262d' : 'transparent',
                      color: tradeMode === 'instant' ? '#fff' : '#8b949e', cursor: 'pointer'
                    }}
                  >Instant Match</button>
                </div>

                {/* Outcome Selection */}
                <div>
                  <div style={{ fontSize: '0.75rem', color: '#8b949e', marginBottom: '8px' }}>Outcome ⓘ</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => setTradeOutcome('yes')}
                      style={{
                        flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 800, fontSize: '0.85rem',
                        background: tradeOutcome === 'yes' ? '#00ba7c' : '#21262d',
                        color: tradeOutcome === 'yes' ? '#fff' : '#8b949e', cursor: 'pointer'
                      }}
                    >
                      Yes ${(() => {
                        const bestNoBid = orderbook.no.filter(l => l.direction === 'bid').sort((a, b) => b.price - a.price)[0];
                        const bestYesAsk = orderbook.yes.filter(l => l.direction === 'ask').sort((a, b) => a.price - b.price)[0];
                        const inferredAsk = bestNoBid ? (1000 - bestNoBid.price) : 500;
                        const finalAsk = bestYesAsk ? Math.min(bestYesAsk.price, inferredAsk) : inferredAsk;
                        return (finalAsk / 1000).toFixed(3);
                      })()}
                    </button>
                    <button
                      onClick={() => setTradeOutcome('no')}
                      style={{
                        flex: 1, padding: '12px', borderRadius: '8px', border: 'none', fontWeight: 800, fontSize: '0.85rem',
                        background: tradeOutcome === 'no' ? '#58a6ff' : '#21262d',
                        color: tradeOutcome === 'no' ? '#fff' : '#8b949e', cursor: 'pointer'
                      }}
                    >
                      No ${(() => {
                        const bestYesBid = orderbook.yes.filter(l => l.direction === 'bid').sort((a, b) => b.price - a.price)[0];
                        const bestNoAsk = orderbook.no.filter(l => l.direction === 'ask').sort((a, b) => a.price - b.price)[0];
                        const inferredAsk = bestYesBid ? (1000 - bestYesBid.price) : 500;
                        const finalAsk = bestNoAsk ? Math.min(bestNoAsk.price, inferredAsk) : inferredAsk;
                        return (finalAsk / 1000).toFixed(3);
                      })()}
                    </button>
                  </div>
                </div>

                {/* Amount / Quantity Input */}
                <div style={{ background: '#0d1117', padding: '14px', borderRadius: '12px', border: '1px solid #21262d' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c9d1d9' }}>
                      {tradeMode === 'instant' ? 'Amount($)' : 'Quantity'}
                    </div>
                    {tradeMode === 'instant' && (
                      <div style={{ fontSize: '0.7rem', color: '#1f6feb' }}>
                        Balance: <span style={{ color: '#58a6ff' }}>$146.6884</span>
                        <span style={{ marginLeft: '8px', background: '#21262d', padding: '2px 8px', borderRadius: '6px', color: '#8b949e', cursor: 'pointer' }}>Max</span>
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <button
                      onClick={() => {
                        if (tradeMode === 'instant') setTradeAmount(a => Math.max(1, parseFloat(a) - 1).toString());
                        else setTradeQty(q => Math.max(1, q - 1));
                      }}
                      style={{ width: '32px', height: '32px', background: '#21262d', border: 'none', borderRadius: '6px', color: '#8b949e', cursor: 'pointer' }}
                    >–</button>
                    <input
                      type="number"
                      value={tradeMode === 'instant' ? tradeAmount : tradeQty}
                      onChange={(e) => {
                        if (tradeMode === 'instant') setTradeAmount(e.target.value);
                        else setTradeQty(parseInt(e.target.value) || 0);
                      }}
                      style={{
                        flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', fontWeight: 700, textAlign: 'center', outline: 'none'
                      }}
                    />
                    <button
                      onClick={() => {
                        if (tradeMode === 'instant') setTradeAmount(a => (parseFloat(a) + 1).toString());
                        else setTradeQty(q => q + 1);
                      }}
                      style={{ width: '32px', height: '32px', background: '#21262d', border: 'none', borderRadius: '6px', color: '#8b949e', cursor: 'pointer' }}
                    >+</button>
                  </div>
                </div>

                {tradeMode === 'limit' && (
                  <div style={{ background: '#0d1117', padding: '14px', borderRadius: '12px', border: '1px solid #21262d' }}>
                    <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c9d1d9', marginBottom: '8px' }}>Price</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <button onClick={() => setTradePrice(p => (parseFloat(p) - 0.005).toFixed(3))} style={{ width: '32px', height: '32px', background: '#21262d', border: 'none', borderRadius: '6px', color: '#8b949e', cursor: 'pointer' }}>–</button>
                      <input
                        type="number"
                        step="0.005"
                        value={tradePrice}
                        onChange={(e) => setTradePrice(e.target.value)}
                        style={{ flex: 1, background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', fontWeight: 700, textAlign: 'center', outline: 'none' }}
                      />
                      <button onClick={() => setTradePrice(p => (parseFloat(p) + 0.005).toFixed(3))} style={{ width: '32px', height: '32px', background: '#21262d', border: 'none', borderRadius: '6px', color: '#8b949e', cursor: 'pointer' }}>+</button>
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#1f6feb' }}>
                    <span style={{ background: '#1f6feb22', padding: '2px 4px', borderRadius: '4px', fontWeight: 700 }}>BP</span> Book Profits ⓘ
                  </div>
                  <div style={{ width: '36px', height: '20px', background: '#21262d', borderRadius: '10px', position: 'relative', cursor: 'pointer' }}>
                    <div style={{ width: '12px', height: '12px', background: '#30363d', borderRadius: '50%', position: 'absolute', top: '4px', right: '4px' }} />
                  </div>
                </div>

                {/* Order Details */}
                <div style={{ borderTop: '1px solid #21262d', paddingTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <span style={{ fontSize: '0.8rem', fontWeight: 700, color: '#c9d1d9' }}>Order Details</span>
                    <span style={{ fontSize: '0.8rem', color: '#8b949e' }}>˄</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', fontSize: '0.75rem', color: '#8b949e' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Avg Price</span>
                      <span style={{ color: '#c1c1c1' }}>${breakdown.avgPrice.toFixed(4)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Qty</span>
                      <span style={{ color: '#c1c1c1' }}>{breakdown.qty.toFixed(2)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Estimated fees ⓘ</span>
                      <span style={{ color: '#c1c1c1' }}>${breakdown.fee.toFixed(4)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Potential return</span>
                      <span style={{ color: '#00ba7c', fontWeight: 700 }}>
                        ${breakdown.potProfit.toFixed(4)} ({breakdown.roi.toFixed(2)}%)
                      </span>
                    </div>
                  </div>
                </div>

                <button style={{
                  width: '100%', padding: '14px', borderRadius: '120px', border: 'none', fontWeight: 800, fontSize: '1rem',
                  background: tradeOutcome === 'yes' ? '#00ba7c' : '#58a6ff',
                  color: '#fff', cursor: 'pointer', marginTop: 'auto',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.3)', transition: '0.2s'
                }}>
                  {tradeSide === 'add' ? 'Buy' : 'Sell'} {tradeOutcome === 'yes' ? 'Yes' : 'No'}
                </button>
              </div>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#8b949e' }}>
            Select a market from the list
          </div>
        )}
      </div>

      <style>{`
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #58a6ff; }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div >
  );
}
