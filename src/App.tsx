import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchFliqQuestions, fetchFliqOrderbook, filterFliqMatches, type FliqQuestion, type FliqOrderbookLevel } from './services/fliq';
import { fetchPolyMarkets, searchPolyMarkets, filterPolyMarkets, fetchPolyPrice, type PolyMarket } from './services/poly';
import { computeMatchScore, extractTeams, computeDetailedTrust, identifyMarketClass, type MatchResult } from './services/matcher';
import { verifyMatchSemantic } from './services/ai';


type LiquidityLevel = 'NONE' | 'LOW' | 'MED' | 'HIGH';

const ScanlineOverlay = () => (
  <div style={{
    position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
    background: 'linear-gradient(rgba(18, 16, 16, 0) 50%, rgba(0, 0, 0, 0.1) 50%)',
    backgroundSize: '100% 3px',
    pointerEvents: 'none',
    zIndex: 9999,
    opacity: 0.5
  }} />
);

const CategoryIcon = ({ category, style }: { category: string; style?: React.CSSProperties }) => {
  const cat = category.toLowerCase();

  const iconStyle: React.CSSProperties = {
    ...style,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(33, 38, 45, 0.5)',
    borderRadius: '4px', color: '#58a6ff',
    border: '1px solid rgba(88, 166, 255, 0.3)',
    boxShadow: '0 0 10px rgba(88, 166, 255, 0.1)'
  };

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
  const [priceCache, setPriceCache] = useState<Record<string, number>>({});
  const [expandedParents, setExpandedParents] = useState<Record<string, boolean>>({});

  // Navigation & Arb State
  const [currentView, setCurrentView] = useState<'arb' | 'all' | 'audit'>('arb');
  const [polyMarkets, setPolyMarkets] = useState<PolyMarket[]>([]);
  const [matchedMarkets, setMatchedMarkets] = useState<(MatchResult & {
    verificationState?: 'IDLE' | 'VERIFYING' | 'VERIFIED' | 'FAILED',
    verificationReason?: string,
    verificationConfidence?: number
  })[]>([]);
  const [matcherLoading, setMatcherLoading] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<(MatchResult & {
    verificationState?: 'IDLE' | 'VERIFYING' | 'VERIFIED' | 'FAILED',
    verificationReason?: string,
    verificationConfidence?: number
  }) | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [calcWager, setCalcWager] = useState('35.00');
  const [calcTab, setCalcTab] = useState('CALCULATOR');

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

  // --- PERSISTENT VERIFICATION CACHE ---
  const getCacheKey = (m: MatchResult) => `verified_${m.fliq.questionId}_${m.poly.id}`;

  const saveToCache = (match: MatchResult, result: any) => {
    const cache = JSON.parse(localStorage.getItem('hercules_verified_v1') || '{}');
    cache[getCacheKey(match)] = {
      state: 'VERIFIED',
      reason: result.reasoning,
      confidence: result.confidence,
      timestamp: Date.now()
    };
    localStorage.setItem('hercules_verified_v1', JSON.stringify(cache));
  };

  const getFromCache = (match: MatchResult) => {
    const cache = JSON.parse(localStorage.getItem('hercules_verified_v1') || '{}');
    return cache[getCacheKey(match)];
  };

  const calculateLiquidity = (levels: FliqOrderbookLevel[]): LiquidityLevel => {
    if (levels.length === 0) return 'NONE';
    const totalSize = levels.reduce((sum, l) => sum + l.total_size, 0);
    if (totalSize < 500) return 'LOW';
    if (totalSize < 2000) return 'MED';
    return 'HIGH';
  };

  async function prefetchLiquidity(markets: FliqQuestion[]) {
    const lUpdates: Record<string, LiquidityLevel> = {};
    const pUpdates: Record<string, number> = {};

    await Promise.allSettled(markets.map(async (m) => {
      try {
        const levels = await fetchFliqOrderbook(m.yesTokenMarketId);
        lUpdates[m.questionId] = calculateLiquidity(levels);

        const bestBid = levels
          .filter(l => l.direction === 'bid')
          .sort((a, b) => b.price - a.price)[0];

        if (bestBid) {
          pUpdates[m.questionId] = bestBid.price / 1000;
        }
      } catch {
        lUpdates[m.questionId] = 'NONE';
      }
    }));

    setLiquidityCache(prev => ({ ...prev, ...lUpdates }));
    setPriceCache(prev => ({ ...prev, ...pUpdates }));
  }

  const groupedArbs = useMemo(() => {
    const groups: Record<string, {
      eventTitle: string;
      date: string;
      category: string;
      endTime: number;
      items: typeof matchedMarkets;
    }> = {};

    matchedMarkets.forEach(m => {
      if (!m.fliq?.blockchainMetadata) return;

      const bm = m.fliq.blockchainMetadata;
      // Stable grouping by parentQuestionId and Raw Timestamp
      const groupToken = bm.parentQuestionId || m.fliq.questionId;
      const key = `${groupToken}_${bm.questionEndTime}`;

      const fEndTime = parseInt(bm.questionEndTime || '0');
      const eventTitle = bm.parentQuestionHeader || bm.questionHeader || 'Unknown Event';
      const date = formatTimeLeft(fEndTime);
      const category = m.fliq.category || bm.category || (bm.tags && bm.tags[0]) || 'GENERAL';

      if (!groups[key]) {
        groups[key] = {
          eventTitle: eventTitle.split(',')[0].trim(), // Header: Macclesfield vs Brentford
          date,
          category: category.toUpperCase(),
          endTime: fEndTime,
          items: []
        };
      }
      groups[key].items.push(m);
    });

    // Sort by end time (soonest first) to match All Markets view
    return Object.values(groups).sort((a, b) => a.endTime - b.endTime);
  }, [matchedMarkets]);

  // Format time left until market ends
  function formatTimeLeft(endTs: number) {
    const now = Date.now() / 1000;
    const diff = endTs - now;
    if (diff <= 0) return 'ENDED';
    const mins = Math.floor(diff / 60);
    if (mins < 60) return `${mins} mins`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hrs`;
    const days = Math.floor(hours / 24);
    return `${days}d`;
  }

  // Initial Data Load
  const loadData = async () => {
    setLoading(true);
    setMatcherLoading(true);
    setError(null);
    try {
      const [fliqRaw, polyRaw] = await Promise.all([
        fetchFliqQuestions(5000),
        fetchPolyMarkets(1000)
      ]);

      const filteredFliq = filterFliqMatches(fliqRaw).filter(fq => {
        const cls = identifyMarketClass(fq.blockchainMetadata.questionHeader, fq.blockchainMetadata.questionHeaderExpanded);
        return cls !== 'EXCLUDED';
      });
      const filteredPoly = filterPolyMarkets(polyRaw);

      setAllQuestions(filteredFliq);
      setPolyMarkets(filteredPoly);

      // Match Fliq questions to Poly markets
      const matches: (MatchResult & {
        verificationState?: 'IDLE' | 'VERIFYING' | 'VERIFIED' | 'FAILED',
        verificationReason?: string,
        verificationConfidence?: number
      })[] = [];
      filteredFliq.forEach(fq => {
        filteredPoly.forEach(pm => {
          const score = computeMatchScore(fq, pm);
          if (score > 0.30) { // Relaxed matching threshold
            const match: any = {
              fliq: fq,
              poly: pm,
              score,
              trust: computeDetailedTrust(fq, pm),
              verificationState: 'IDLE',
              verificationReason: ''
            };

            // Restore from Cache
            const cached = getFromCache(match);
            if (cached) {
              if (cached.state === 'FAILED') return; // Skip failed ones from scan list
              match.verificationState = cached.state;
              match.verificationReason = cached.reason;
              match.verificationConfidence = cached.confidence;
            }

            matches.push(match);
          }
        });
      });

      // Deduplicate matches (keep highest score for each fliq question)
      const bestMatches: (MatchResult & {
        verificationState?: 'IDLE' | 'VERIFYING' | 'VERIFIED' | 'FAILED',
        verificationReason?: string,
        verificationConfidence?: number
      })[] = matches.reduce((acc, m) => {
        const existing = acc.find(x => x.fliq.questionId === m.fliq.questionId);
        if (!existing || m.score > existing.score) {
          return [...acc.filter(x => x.fliq.questionId !== m.fliq.questionId), m];
        }
        return acc;
      }, [] as any[]);

      setMatchedMarkets(bestMatches.sort((a, b) => b.score - a.score));

      // EVENT-FIRST MATCHING: Group Fliq by Match-up and search Poly once for the whole event
      const eventGroups: Record<string, FliqQuestion[]> = {};
      filteredFliq.forEach(fq => {
        const [ta, tb] = extractTeams(fq.blockchainMetadata.parentQuestionHeader || fq.blockchainMetadata.questionHeader || '');
        if (ta && tb) {
          const key = [ta, tb].sort().join('||');
          if (!eventGroups[key]) eventGroups[key] = [];
          eventGroups[key].push(fq);
        }
      });

      console.log(`[Hercules] Event Discovery: Found ${Object.keys(eventGroups).length} unique match-ups.`);

      await Promise.all(Object.entries(eventGroups).map(async ([teamsKey, fliqQs]) => {
        const [ta, tb] = teamsKey.split('||');

        // Search for the event header
        const queries = [
          `${ta} ${tb}`,
          `${ta} vs ${tb}`,
          `${ta} ${tb} goals`,
          `${ta} ${tb} btts`
        ];

        for (const query of queries) {
          const polyResults = await searchPolyMarkets(query);
          if (polyResults.length === 0) continue;

          // Pair every Poly result with every Fliq question for this match-up
          polyResults.forEach(pm => {
            fliqQs.forEach(fq => {
              const score = computeMatchScore(fq, pm);
              if (score > 0.30) { // Deep scan threshold
                const match: any = {
                  fliq: fq,
                  poly: pm,
                  score,
                  trust: computeDetailedTrust(fq, pm),
                  verificationState: 'IDLE'
                };
                const cached = getFromCache(match);
                if (cached) {
                  if (cached.state === 'FAILED') return;
                  match.verificationState = cached.state;
                  match.verificationReason = cached.reason;
                }
                bestMatches.push(match);
              }
            });
          });
        }
      }));

      // Final dedupe and update
      const finalMatches = bestMatches.reduce((acc, m) => {
        const existing = acc.find(x => x.fliq.questionId === m.fliq.questionId);
        if (!existing || m.score > existing.score) {
          return [...acc.filter(x => x.fliq.questionId !== m.fliq.questionId), m as any];
        }
        return acc;
      }, [] as (MatchResult & { verificationState?: 'IDLE' | 'VERIFYING' | 'VERIFIED' | 'FAILED' })[]);

      setMatchedMarkets(finalMatches.sort((a, b) => b.score - a.score));

      // Prefetching
      const marketsToPrefetch = finalMatches.map(m => m.fliq).slice(0, 50);
      prefetchLiquidity(marketsToPrefetch);

      if (finalMatches.length > 0 && !selectedMarket) {
        setSelectedMarket(finalMatches[0].fliq);
      }
    } catch (e: any) {
      setError(e.message || 'Failed to fetch market data');
    } finally {
      setLoading(false);
      setMatcherLoading(false);
    }
  };

  // --- STABLE AUTONOMOUS AUDITING PIPELINE ---
  useEffect(() => {
    if (loading || matcherLoading) return;

    const triggerAudits = async () => {
      // Relaxed threshold to verify nearly everything automatically
      const pending = matchedMarkets.filter(m => m.score > 0.4 && m.verificationState === 'IDLE');
      if (pending.length === 0) return;

      console.log(`[Hercules] Initializing Silent Audit for ${pending.length} matches...`);

      // Process in small sequential batches to prevent UI lock
      for (const m of pending) {
        try {
          const result = await verifyMatchSemantic(m);
          if (result.success) {
            saveToCache(m, result);
            setMatchedMarkets(prev => prev.map(p =>
              (p.fliq.questionId === m.fliq.questionId && p.poly.id === m.poly.id)
                ? { ...p, verificationState: 'VERIFIED', verificationReason: result.reasoning, verificationConfidence: result.confidence }
                : p
            ));
          } else {
            // Mark as failed if AI rejected it, so we don't keep trying
            setMatchedMarkets(prev => prev.map(p =>
              (p.fliq.questionId === m.fliq.questionId && p.poly.id === m.poly.id)
                ? { ...p, verificationState: 'FAILED' }
                : p
            ));
          }
        } catch (err) {
          console.error('[Hercules] Silent Audit Failed:', err);
        }
        // Small throttle
        await new Promise(r => setTimeout(r, 200));
      }
    };

    triggerAudits();
  }, [matchedMarkets.length, loading, matcherLoading]);

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
      (g.parentHeader || '').toLowerCase().includes(q) ||
      g.subQuestions.some(sq => (sq.blockchainMetadata?.questionHeader || '').toLowerCase().includes(q))
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

  const arbPlan = useMemo(() => {
    if (!selectedMatch) return null;
    const fliqWager = parseFloat(calcWager) || 3;
    const polyYesPrice = parseFloat(selectedMatch.poly.outcomePrices?.[0] || '0.5');
    const polyNoPrice = 1 - polyYesPrice;

    const fliqYesLevels = (orderbook.yes || []).map(l => ({ price: l.price / 1000, size: l.total_size / 1000 }));
    const fliqNoLevels = (orderbook.no || []).map(l => ({ price: l.price / 1000, size: l.total_size / 1000 }));

    // Strategy Discovery: Which side is the better Arb?
    // We test Fliq YES+NO to see which has better spread against Poly
    const getFliqSharesModel = (levels: { price: number, size: number }[], budget: number) => {
      let remainingBudget = budget;
      let totalShares = 0;
      for (const lvl of levels) {
        const costAtLevel = lvl.size * lvl.price;
        const takeBudget = Math.min(remainingBudget, costAtLevel);
        totalShares += takeBudget / lvl.price;
        remainingBudget -= takeBudget;
        if (remainingBudget <= 0) break;
      }
      if (remainingBudget > 0) totalShares += remainingBudget / (levels[levels.length - 1]?.price || 0.99);
      return totalShares;
    };

    const sharesA = getFliqSharesModel(fliqYesLevels, fliqWager);
    const sharesB = getFliqSharesModel(fliqNoLevels, fliqWager);

    // Balanced Profit if we hedge sharesA on Poly NO: Profit = sharesA - (fliqWager + sharesA * polyNoPrice)
    const profitA = sharesA - (fliqWager + (sharesA * polyNoPrice));
    const profitB = sharesB - (fliqWager + (sharesB * polyYesPrice));

    const isA = profitA > profitB;
    const activeShares = isA ? sharesA : sharesB;
    const activePolyPrice = isA ? polyNoPrice : polyYesPrice;
    const polyCost = activeShares * activePolyPrice;
    const totalBasis = fliqWager + polyCost;
    const netPnl = activeShares - totalBasis;

    return {
      strategy: isA ? 'YES @ FLIQ // NO @ POLY' : 'NO @ FLIQ // YES @ POLY',
      fliq: {
        avgPrice: activeShares > 0 ? fliqWager / activeShares : 0,
        shares: activeShares,
        cost: fliqWager,
        fee: fliqWager * 0.015,
        totalCost: fliqWager * 1.015,
        warning: fliqWager > 35,
        side: isA ? 'YES' : 'NO'
      },
      poly: {
        avgPrice: activePolyPrice,
        shares: activeShares,
        cost: polyCost,
        totalCost: polyCost,
        side: isA ? 'NO' : 'YES'
      },
      summary: { netPnl, roi: (netPnl / totalBasis) * 100, costBasis: totalBasis }
    };
  }, [selectedMatch, calcWager, orderbook]);

  const liquiditySim = useMemo(() => {
    if (!selectedMatch) return [];
    const budgetSteps = [1, 2, 3, 4, 5, 7.5, 10, 15, 20, 35, 50, 100];
    const polyYesPrice = parseFloat(selectedMatch.poly.outcomePrices?.[0] || '0.5');
    const polyNoPrice = 1 - polyYesPrice;
    const fliqYesLevels = (orderbook.yes || []).map(l => ({ price: l.price / 1000, size: l.total_size / 1000 }));
    const fliqNoLevels = (orderbook.no || []).map(l => ({ price: l.price / 1000, size: l.total_size / 1000 }));

    const getFliqSharesModel = (levels: { price: number, size: number }[], budget: number) => {
      let remainingBudget = budget;
      let totalShares = 0;
      for (const lvl of levels) {
        const costAtLevel = lvl.size * lvl.price;
        const takeBudget = Math.min(remainingBudget, costAtLevel);
        totalShares += takeBudget / lvl.price;
        remainingBudget -= takeBudget;
        if (remainingBudget <= 0) break;
      }
      if (remainingBudget > 0) totalShares += remainingBudget / (levels[levels.length - 1]?.price || 0.99);
      return totalShares;
    };

    return budgetSteps.map(budget => {
      const sharesA = getFliqSharesModel(fliqYesLevels, budget);
      const sharesB = getFliqSharesModel(fliqNoLevels, budget);
      const profitA = sharesA - (budget + (sharesA * polyNoPrice));
      const profitB = sharesB - (budget + (sharesB * polyYesPrice));
      const isA = profitA > profitB;

      const fliqShares = isA ? sharesA : sharesB;
      const polyPrice = isA ? polyNoPrice : polyYesPrice;
      const polyCost = fliqShares * polyPrice;
      const totalCost = (budget * 1.015) + polyCost;
      const netPnl = fliqShares - totalCost;
      const roi = totalCost > 0 ? (netPnl / totalCost) * 100 : 0;
      return { budget, fliqShares, polyCost, totalCost, netPnl, roi };
    });
  }, [selectedMatch, orderbook]);

  const bestSim = useMemo(() => {
    if (!liquiditySim.length) return null;
    return [...liquiditySim].sort((a, b) => b.netPnl - a.netPnl)[0];
  }, [liquiditySim]);

  const formatPlanValue = (val: number) => (val === undefined || isNaN(val)) ? '--' : val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      background: 'linear-gradient(135deg, #05070a 0%, #0d1117 100%)',
      color: '#e6edf3',
      fontFamily: '"Inter", sans-serif',
      overflow: 'hidden',
      position: 'relative'
    }}>
      <ScanlineOverlay />
      <div style={{
        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
        background: 'radial-gradient(circle at 50% 0%, rgba(31, 111, 235, 0.08) 0%, transparent 70%)',
        pointerEvents: 'none'
      }} />

      {/* HEADER: Navigation */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 24px', height: '64px',
        background: 'rgba(22, 27, 34, 0.8)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(48, 54, 61, 0.8)',
        zIndex: 100,
        boxShadow: '0 4px 20px rgba(0,0,0,0.4)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
          <div style={{
            fontSize: '1.6rem', fontWeight: 900,
            fontFamily: '"Orbitron", sans-serif',
            letterSpacing: '2px',
            background: 'linear-gradient(180deg, #fff 0%, #58a6ff 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            filter: 'drop-shadow(0 0 15px rgba(88, 166, 255, 0.4))'
          }}>HERCULES</div>

          <nav style={{ display: 'flex', gap: '4px', background: 'rgba(13, 17, 23, 0.6)', padding: '4px', borderRadius: '10px', border: '1px solid rgba(48, 54, 61, 0.5)' }}>
            <button
              onClick={() => setCurrentView('arb')}
              style={{
                background: currentView === 'arb' ? '#1f6feb' : 'transparent',
                border: 'none', color: currentView === 'arb' ? '#fff' : '#8b949e',
                padding: '8px 20px', borderRadius: '8px', cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: 800, transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                display: 'flex', alignItems: 'center', gap: '8px',
                fontFamily: '"Orbitron", sans-serif',
                boxShadow: currentView === 'arb' ? '0 0 15px rgba(31, 111, 235, 0.4)' : 'none'
              }}
            >
              <span style={{ filter: currentView === 'arb' ? 'drop-shadow(0 0 5px #fff)' : 'none' }}>⚡</span> ARB TERMINAL
            </button>
            {[
              { id: 'all', label: 'ALL MARKETS', icon: '🌐' },
              { id: 'audit', label: 'AUDIT LOG', icon: '📋' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id as any)}
                style={{
                  background: currentView === tab.id ? 'rgba(31, 111, 235, 0.15)' : 'transparent',
                  color: currentView === tab.id ? '#58a6ff' : '#8b949e',
                  border: 'none', borderRadius: '8px', padding: '8px 16px',
                  fontSize: '0.8rem', fontWeight: 700, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  transition: '0.2s',
                  borderBottom: `2px solid ${currentView === tab.id ? '#58a6ff' : 'transparent'}`
                }}
              >
                <span>{tab.icon}</span> {tab.label}
              </button>
            ))}
          </nav>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '0.75rem', color: '#c9d1d9', fontWeight: 500 }}>
            {matchedMarkets.length} Matches | {polyMarkets.length} Poly Assets
          </div>
          <button
            onClick={loadData}
            style={{
              background: '#238636', color: '#fff', border: 'none', borderRadius: '6px',
              padding: '8px 20px', fontWeight: 700, cursor: 'pointer', fontSize: '0.8rem',
              opacity: loading || matcherLoading ? 0.7 : 1
            }}
          >
            {loading || matcherLoading ? 'SYNCING...' : 'SYNC ALL'}
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
        {/* VIEW: ARB TERMINAL */}
        {currentView === 'arb' && (
          <div style={{ flex: 1, padding: '30px', overflowY: 'auto', minHeight: 0 }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end',
              animation: 'fadeIn 0.5s ease-out'
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#238636', boxShadow: '0 0 10px #238636' }} />
                  <h1 style={{
                    margin: 0, fontSize: '1.4rem', fontWeight: 800,
                    fontFamily: '"Orbitron", sans-serif',
                    letterSpacing: '1px',
                    color: '#fff'
                  }}>LIVE ARB SCANNER</h1>
                </div>
                <p style={{ margin: 0, color: '#8b949e', fontSize: '0.85rem', fontFamily: '"Orbitron", sans-serif' }}>TARGET: CROSS-PLATFORM OPPORTUNITIES</p>
              </div>
              <div style={{ display: 'flex', gap: '20px', fontFamily: '"Orbitron", sans-serif', fontSize: '0.75rem' }}>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#8b949e' }}>STATUS</div>
                  <div style={{ color: '#58a6ff' }}>{loading ? 'SCANNING...' : 'ACTIVE'}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#8b949e' }}>COVERAGE</div>
                  <div style={{ color: '#fff' }}>{polyMarkets.length} ASSETS</div>
                </div>
              </div>
            </div>

            <div style={{
              background: 'rgba(22, 27, 34, 0.4)',
              backdropFilter: 'blur(10px)',
              borderRadius: '16px',
              border: '1px solid rgba(48, 54, 61, 0.5)',
              overflow: 'hidden',
              boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
              animation: 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(13, 17, 23, 0.8)', borderBottom: '1px solid #30363d' }}>
                    <th style={{ padding: '16px', fontSize: '0.7rem', color: '#8b949e', textTransform: 'uppercase', fontFamily: '"Orbitron", sans-serif' }}>IDENTIFIER</th>
                    <th style={{ padding: '16px', fontSize: '0.7rem', color: '#8b949e', textTransform: 'uppercase', fontFamily: '"Orbitron", sans-serif' }}>FLIQ_FEED</th>
                    <th style={{ padding: '16px', fontSize: '0.7rem', color: '#8b949e', textTransform: 'uppercase', fontFamily: '"Orbitron", sans-serif' }}>POLY_FEED</th>
                    <th style={{ padding: '16px', fontSize: '0.7rem', color: '#8b949e', textTransform: 'uppercase', fontFamily: '"Orbitron", sans-serif', textAlign: 'right' }}>EXECUTION</th>
                  </tr>
                </thead>
                <tbody>
                  {groupedArbs.length > 0 ? groupedArbs.map((group, i) => {
                    // Derive group-level verification
                    const isGroupVerified = group.items.some(m => m.verificationState === 'VERIFIED');
                    const isGroupVerifying = group.items.some(m => m.verificationState === 'VERIFYING');
                    const latestMatchWithAudit = group.items.find(m => m.verificationState === 'VERIFIED');
                    const cachedAudit = latestMatchWithAudit ? getFromCache(latestMatchWithAudit) : null;

                    return (
                      <tr key={i} style={{ borderBottom: '1px solid rgba(48, 54, 61, 0.4)', transition: 'all 0.2s' }}>
                        <td colSpan={4} style={{ padding: 0 }}>
                          {/* GROUP HEADER: MATCH INFO */}
                          <div style={{
                            padding: '18px 25px',
                            background: 'rgba(31, 111, 235, 0.08)',
                            borderBottom: '1px solid rgba(48, 54, 61, 0.5)',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            position: 'sticky', top: 0, zIndex: 1, backdropFilter: 'blur(5px)'
                          }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                              <div style={{ width: '5px', height: '22px', background: '#58a6ff', borderRadius: '3px', boxShadow: '0 0 10px #58a6ff' }} />
                              <div>
                                <div style={{ fontWeight: 800, fontSize: '1rem', color: '#fff', fontFamily: '"Orbitron", sans-serif', letterSpacing: '0.5px' }}>{group.eventTitle}</div>
                                <div style={{ display: 'flex', gap: '10px', marginTop: '4px', alignItems: 'center' }}>
                                  <span style={{ fontSize: '0.6rem', color: '#58a6ff', background: 'rgba(31, 111, 235, 0.1)', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '1px', fontWeight: 900 }}>{group.category}</span>
                                  <span style={{ fontSize: '0.65rem', color: '#8b949e', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                                    {group.date}
                                  </span>
                                  <span style={{ fontSize: '0.65rem', color: '#58a6ff' }}>{group.items.length} Markets Found</span>
                                </div>
                              </div>
                            </div>

                            {/* AGGREGATED VERIFICATION BUTTON */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'flex-end' }}>
                              <button
                                onClick={async () => {
                                  // Re-verify the highest confidence match in the group
                                  const bestMatch = [...group.items].sort((a, b) => b.score - a.score)[0];
                                  if (bestMatch) {
                                    setMatchedMarkets(prev => prev.map(p =>
                                      (p.fliq.questionId === bestMatch.fliq.questionId) ? { ...p, verificationState: 'VERIFYING' } : p
                                    ));
                                    const result = await verifyMatchSemantic(bestMatch);
                                    if (result.success) {
                                      saveToCache(bestMatch, result);
                                      setMatchedMarkets(prev => prev.map(p =>
                                        (p.fliq.questionId === bestMatch.fliq.questionId) ? { ...p, verificationState: 'VERIFIED', verificationReason: result.reasoning } : p
                                      ));
                                    } else {
                                      setMatchedMarkets(prev => prev.map(p =>
                                        (p.fliq.questionId === bestMatch.fliq.questionId) ? { ...p, verificationState: 'FAILED' } : p
                                      ));
                                    }
                                  }
                                }}
                                style={{
                                  padding: '8px 16px',
                                  background: isGroupVerified ? 'rgba(35, 134, 54, 0.15)' : (isGroupVerifying ? 'rgba(210, 153, 34, 0.1)' : 'rgba(88, 166, 255, 0.05)'),
                                  color: isGroupVerified ? '#3fb950' : (isGroupVerifying ? '#d29922' : '#58a6ff'),
                                  border: `1px solid ${isGroupVerified ? '#3fb950' : (isGroupVerifying ? '#d29922' : 'rgba(88, 166, 255, 0.3)')}`,
                                  borderRadius: '6px',
                                  fontSize: '0.65rem', fontWeight: 900,
                                  fontFamily: '"Orbitron", sans-serif',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.5px',
                                  cursor: 'pointer',
                                  transition: '0.2s'
                                }}
                              >
                                {isGroupVerifying ? 'AUDITING...' : (isGroupVerified ? 'AUDITED ✓' : 'VERIFY MATCH')}
                              </button>
                              {cachedAudit && (
                                <div style={{ fontSize: '0.5rem', color: '#8b949e', textAlign: 'right', fontWeight: 500 }}>
                                  AUTH_TS: {new Date(cachedAudit.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              )}
                            </div>
                          </div>

                          {/* GROUP ITEMS: BITS & PIECES */}
                          <div>
                            {group.items.map((match, j) => {
                              return (
                                <div key={j} style={{
                                  display: 'flex',
                                  padding: '12px 25px', alignItems: 'center',
                                  borderBottom: j === group.items.length - 1 ? 'none' : '1px solid rgba(48, 54, 61, 0.3)',
                                  transition: 'background 0.2s',
                                  background: j % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)'
                                }}>
                                  <div style={{ flex: 1, display: 'flex', gap: '20px', alignItems: 'center' }}>
                                    {/* FLIQ CONSOLIDATED BOX (LEFT) */}
                                    <div style={{
                                      minWidth: '320px', flexShrink: 0,
                                      fontSize: '0.65rem', color: '#8b949e', border: '1px solid rgba(139, 148, 158, 0.3)',
                                      padding: '8px 12px', borderRadius: '4px', background: 'rgba(139, 148, 158, 0.08)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                        <span style={{ color: '#58a6ff', fontWeight: 900, background: 'rgba(31, 111, 235, 0.1)', padding: '1px 4px', borderRadius: '2px' }}>FLIQ</span>
                                        <span style={{ color: '#c9d1d9', fontWeight: 600 }}>{(match.fliq.blockchainMetadata?.questionHeader || '').replace(/,/g, '')}</span>
                                      </div>
                                    </div>

                                    <div style={{ fontSize: '1rem', color: '#30363d', fontWeight: 900 }}>→</div>

                                    {/* POLY CONSOLIDATED BOX (RIGHT) */}
                                    <div style={{
                                      width: '320px', flexShrink: 0,
                                      fontSize: '0.65rem', color: '#58a6ff', border: '1px solid rgba(88, 166, 255, 0.4)',
                                      padding: '8px 12px', borderRadius: '4px', background: 'rgba(56, 139, 253, 0.1)',
                                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                      overflow: 'hidden', boxShadow: '0 0 15px rgba(88, 166, 255, 0.1)'
                                    }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden', width: '100%' }}>
                                        <span style={{ color: '#fff', fontWeight: 900, background: '#1f6feb', padding: '1px 4px', borderRadius: '2px', flexShrink: 0 }}>POLY</span>
                                        <span style={{
                                          color: '#c9d1d9', fontWeight: 700,
                                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                          flex: 1
                                        }}>{(() => {
                                          const t = (match.poly.title || match.poly.description || '').toLowerCase();
                                          if (t.includes('2.5') || t.includes('3 or more')) return 'Over 2.5 Goals';
                                          if (t.includes('1.5') || t.includes('2 or more')) return 'Over 1.5 Goals';
                                          if (t.includes('btts') || t.includes('both teams')) return 'BTTS: Yes';
                                          const rawTitle = (match.poly.title || '').split(':').pop()?.trim() || 'WINNER';
                                          return rawTitle;
                                        })()}</span>
                                        <span style={{
                                          fontSize: '0.55rem',
                                          color: match.score > 0.7 ? '#3fb950' : (match.score > 0.5 ? '#d29922' : '#f85149'),
                                          background: 'rgba(0,0,0,0.2)',
                                          padding: '1px 4px',
                                          borderRadius: '2px',
                                          fontWeight: 800
                                        }}>
                                          {Math.round(match.score * 100)}%
                                        </span>
                                      </div>
                                    </div>

                                    <div style={{ flex: 1, textAlign: 'right', display: 'flex', justifyContent: 'flex-end' }}>
                                      <button
                                        onClick={() => {
                                          setSelectedMatch(match);
                                          setShowCalculator(true);
                                        }}
                                        style={{
                                          padding: '8px 16px', background: '#238636', color: '#fff', border: 'none', borderRadius: '6px',
                                          fontWeight: 800, fontSize: '0.7rem', fontFamily: '"Orbitron", sans-serif', cursor: 'pointer',
                                          boxShadow: '0 4px 12px rgba(35, 134, 54, 0.3)'
                                        }}
                                      >
                                        SIMULATE
                                      </button>
                                    </div>

                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    );
                  }) : (
                    <tr>
                      <td colSpan={5} style={{ padding: '60px', textAlign: 'center', color: '#8b949e' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '20px' }}>
                          <div style={{ width: '32px', height: '32px', border: '3px solid rgba(88, 166, 255, 0.1)', borderTopColor: '#58a6ff', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                          <div style={{ fontFamily: '"Orbitron", sans-serif', fontSize: '0.8rem', letterSpacing: '1px' }}>
                            {loading ? 'ANALYZING GLOBAL FEEDS...' : 'NO HIGH-CONFIDENCE ARBS FOUND'}
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* VIEW: ALL MARKETS (Sidebar Explorer) */}
        {currentView === 'all' && (
          <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
            <div style={{
              width: '440px', display: 'flex', flexDirection: 'column',
              background: 'rgba(13, 17, 23, 0.4)',
              borderRight: '1px solid rgba(48, 54, 61, 0.6)'
            }}>
              <div style={{
                padding: '20px 24px', borderBottom: '1px solid rgba(48, 54, 61, 0.6)',
                background: 'rgba(22, 27, 34, 0.4)',
                backdropFilter: 'blur(10px)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h1 style={{
                    fontSize: '1rem', fontWeight: 900,
                    fontFamily: '"Orbitron", sans-serif',
                    letterSpacing: '1px', color: '#fff'
                  }}>MARKET_EXPLORER</h1>
                  <div style={{
                    fontSize: '0.6rem', color: '#58a6ff',
                    fontFamily: '"Orbitron", sans-serif',
                    background: 'rgba(31, 111, 235, 0.1)',
                    padding: '2px 6px', borderRadius: '4px', border: '1px solid rgba(31, 111, 235, 0.3)'
                  }}>
                    {allQuestions.length} UNIT_IDS
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    placeholder="Search by ID or keywords..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    style={{
                      flex: 1, padding: '10px 14px',
                      background: 'rgba(13, 17, 23, 0.8)',
                      border: '1px solid rgba(48, 54, 61, 0.8)',
                      borderRadius: '6px',
                      color: '#fff', fontSize: '0.8rem', outline: 'none',
                      fontFamily: '"Inter", sans-serif',
                      transition: '0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = '#58a6ff'}
                    onBlur={(e) => e.target.style.borderColor = 'rgba(48, 54, 61, 0.8)'}
                  />
                  <button
                    onClick={loadData}
                    style={{
                      background: 'rgba(35, 134, 54, 0.1)',
                      color: '#3fb950',
                      border: '1px solid rgba(63, 185, 80, 0.4)',
                      borderRadius: '6px', padding: '0 16px',
                      fontWeight: 700, cursor: 'pointer',
                      fontFamily: '"Orbitron", sans-serif',
                      fontSize: '0.7rem'
                    }}
                  >
                    {loading ? '...' : 'SYNC'}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ padding: '10px 24px', background: 'rgba(248, 81, 73, 0.1)', color: '#f85149', fontSize: '0.75rem', borderBottom: '1px solid rgba(248, 81, 73, 0.2)' }}>
                  [ERR] {error}
                </div>
              )}

              <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
                {loading && allQuestions.length === 0 && (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    height: '300px', color: '#8b949e', gap: '16px'
                  }}>
                    <div style={{
                      width: '40px', height: '40px', border: '2px solid rgba(31, 111, 235, 0.1)',
                      borderTopColor: '#58a6ff', borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                      boxShadow: '0 0 15px rgba(31, 111, 235, 0.2)'
                    }} />
                    <div style={{ fontSize: '0.7rem', fontFamily: '"Orbitron", sans-serif', letterSpacing: '1px', opacity: 0.6 }}>INITIALIZING_FEEDS...</div>
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
                        <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
                          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#fff', fontFamily: '"Orbitron", sans-serif' }}>
                            {group.parent && priceCache[group.parent.questionId] ? `$${priceCache[group.parent.questionId].toFixed(3)}` : (hasSubs ? '--' : '$0.500')}
                          </div>
                          <span style={{
                            display: 'flex', alignItems: 'center', gap: '3px',
                            fontSize: '0.6rem', color: '#f0883e', opacity: 0.8
                          }}>
                            ⏱ {timeLeft}
                          </span>
                        </div>
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
                                <span style={{ flex: 1, fontSize: '0.75rem', color: isSelected ? '#58a6ff' : '#8b949e', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {sq.blockchainMetadata.questionHeader}
                                </span>
                                <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
                                  <div style={{ fontSize: '0.75rem', fontWeight: 800, color: '#c9d1d9', fontFamily: '"Orbitron", sans-serif' }}>
                                    {priceCache[sq.questionId] ? `$${priceCache[sq.questionId].toFixed(3)}` : '$0.500'}
                                  </div>
                                  <span style={{ fontSize: '0.6rem', color: '#f0883e', opacity: 0.8 }}>⏱ {sqTimeLeft}</span>
                                </div>
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
                            background: 'rgba(13, 17, 23, 0.9)', zIndex: 10
                          }}>
                            <div style={{
                              width: '40px', height: '40px', border: '2px solid rgba(88, 166, 255, 0.1)',
                              borderTopColor: '#58a6ff', borderRadius: '50%',
                              animation: 'spin 0.8s linear infinite'
                            }} />
                            <div style={{ marginTop: '16px', color: '#58a6ff', fontSize: '0.7rem', fontFamily: '"Orbitron", sans-serif' }}>SYNCING_LOB...</div>
                          </div>
                        )}

                        {/* No Data State */}
                        {!obLoading && asks.length === 0 && bids.length === 0 && (
                          <div style={{
                            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                            height: '100%', color: '#8b949e', fontSize: '0.85rem', padding: '40px 16px', textAlign: 'center'
                          }}>
                            <div style={{ fontSize: '2rem', marginBottom: '16px', filter: 'grayscale(1) opacity(0.5)' }}>📊</div>
                            <div style={{ fontWeight: 700, color: '#c9d1d9', fontFamily: '"Orbitron", sans-serif', fontSize: '0.9rem' }}>LOB_VACANT</div>
                            <div style={{ fontSize: '0.7rem', marginTop: '4px', opacity: 0.6 }}>No active limit orders detected for this asset.</div>
                            <button
                              onClick={() => { setAutoRefresh(true); refreshOrderbook(selectedMarket); }}
                              style={{
                                marginTop: '20px', background: 'transparent', color: '#3fb950',
                                border: '1px solid rgba(63, 185, 80, 0.4)',
                                padding: '8px 20px', borderRadius: '4px', fontSize: '0.7rem',
                                fontWeight: 800, cursor: 'pointer', fontFamily: '"Orbitron", sans-serif'
                              }}
                            >
                              RESUME_FEED
                            </button>
                          </div>
                        )}

                        {/* ASKS (Blue / Sells) - Highest price top */}
                        {asksWithCumulative.map((l, i) => {
                          const volumePercent = (l.cumulativeAmount / maxSize) * 100;
                          return (
                            <div key={`ask-${i}`} style={{
                              display: 'grid', gridTemplateColumns: '80px 1fr 80px 100px',
                              padding: '6px 20px', fontSize: '0.8rem', position: 'relative', borderBottom: '1px solid rgba(48, 54, 61, 0.2)'
                            }}>
                              <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
                                <div style={{
                                  position: 'absolute', right: 0, top: '4px', bottom: '4px',
                                  width: `${volumePercent}%`, background: 'rgba(56, 139, 253, 0.15)', borderRadius: '1px'
                                }} />
                              </div>
                              <div style={{ textAlign: 'center', color: '#58a6ff', fontWeight: 800, fontFamily: '"Orbitron", sans-serif' }}>{formatPrice(l.price)}</div>
                              <div style={{ textAlign: 'center', color: '#c9d1d9', opacity: 0.9 }}>{formatQty(l.total_size)}</div>
                              <div style={{ textAlign: 'right', color: '#58a6ff', fontWeight: 600, fontFamily: '"Orbitron", sans-serif', fontSize: '0.75rem' }}>{l.cumulativeAmount.toFixed(2)}$</div>
                            </div>
                          );
                        })}

                        <div style={{
                          padding: '10px 20px', background: 'rgba(22, 27, 34, 0.6)', borderBlock: '1px solid rgba(48, 54, 61, 0.5)',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          fontSize: '0.7rem', fontWeight: 800, fontFamily: '"Orbitron", sans-serif', letterSpacing: '1px'
                        }}>
                          <span style={{ color: '#8b949e' }}>SPREAD: {spread}</span>
                          <span style={{ color: '#fff' }}>LTP: {lastPrice}</span>
                        </div>

                        {/* BIDS (Green / Buys) - Highest price top */}
                        {bidsWithCumulative.map((l, i) => {
                          const volumePercent = (l.cumulativeAmount / maxSize) * 100;
                          return (
                            <div key={`bid-${i}`} style={{
                              display: 'grid', gridTemplateColumns: '80px 1fr 80px 100px',
                              padding: '6px 20px', fontSize: '0.8rem', position: 'relative', borderBottom: '1px solid rgba(48, 54, 61, 0.2)'
                            }}>
                              <div style={{ position: 'relative', height: '100%', display: 'flex', alignItems: 'center' }}>
                                <div style={{
                                  position: 'absolute', right: 0, top: '4px', bottom: '4px',
                                  width: `${volumePercent}%`, background: 'rgba(0, 186, 124, 0.15)', borderRadius: '1px'
                                }} />
                              </div>
                              <div style={{ textAlign: 'center', color: '#00ba7c', fontWeight: 800, fontFamily: '"Orbitron", sans-serif' }}>{formatPrice(l.price)}</div>
                              <div style={{ textAlign: 'center', color: '#c9d1d9', opacity: 0.9 }}>{formatQty(l.total_size)}</div>
                              <div style={{ textAlign: 'right', color: '#00ba7c', fontWeight: 600, fontFamily: '"Orbitron", sans-serif', fontSize: '0.75rem' }}>{l.cumulativeAmount.toFixed(2)}$</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* RIGHT: Trade Widget */}
                    <div style={{
                      display: 'flex', flexDirection: 'column',
                      background: 'rgba(17, 20, 24, 0.4)',
                      padding: '24px', gap: '24px', borderLeft: '1px solid rgba(48, 54, 61, 0.5)',
                      backdropFilter: 'blur(10px)'
                    }}>
                      {/* Mode Tabs */}
                      <div style={{ display: 'flex', gap: '2px', background: 'rgba(13, 17, 23, 0.8)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(48, 54, 61, 0.5)' }}>
                        <button
                          onClick={() => setTradeSide('add')}
                          style={{
                            flex: 1, padding: '10px', borderRadius: '6px', border: 'none', fontSize: '0.65rem', fontWeight: 800,
                            fontFamily: '"Orbitron", sans-serif',
                            background: tradeSide === 'add' ? '#21262d' : 'transparent',
                            color: tradeSide === 'add' ? '#fff' : '#8b949e', cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >BUY</button>
                        <button
                          onClick={() => setTradeSide('exit')}
                          style={{
                            flex: 1, padding: '10px', borderRadius: '6px', border: 'none', fontSize: '0.65rem', fontWeight: 800,
                            fontFamily: '"Orbitron", sans-serif',
                            background: tradeSide === 'exit' ? '#21262d' : 'transparent',
                            color: tradeSide === 'exit' ? '#fff' : '#8b949e', cursor: 'pointer',
                            transition: 'all 0.2s'
                          }}
                        >SELL</button>
                      </div>

                      <div style={{ display: 'flex', gap: '2px', background: 'rgba(13, 17, 23, 0.8)', padding: '4px', borderRadius: '8px', border: '1px solid rgba(48, 54, 61, 0.5)' }}>
                        <button
                          onClick={() => setTradeMode('limit')}
                          style={{
                            flex: 1, padding: '10px', borderRadius: '6px', border: 'none', fontSize: '0.65rem', fontWeight: 800,
                            fontFamily: '"Orbitron", sans-serif',
                            background: tradeMode === 'limit' ? '#21262d' : 'transparent',
                            color: tradeMode === 'limit' ? '#fff' : '#8b949e', cursor: 'pointer'
                          }}
                        >LIMIT</button>
                        <button
                          onClick={() => setTradeMode('instant')}
                          style={{
                            flex: 1, padding: '10px', borderRadius: '6px', border: 'none', fontSize: '0.65rem', fontWeight: 800,
                            fontFamily: '"Orbitron", sans-serif',
                            background: tradeMode === 'instant' ? '#21262d' : 'transparent',
                            color: tradeMode === 'instant' ? '#fff' : '#8b949e', cursor: 'pointer'
                          }}
                        >MARKET</button>
                      </div>

                      {/* Outcome Selection */}
                      <div>
                        <div style={{ fontSize: '0.7rem', color: '#8b949e', marginBottom: '10px', fontFamily: '"Orbitron", sans-serif', letterSpacing: '1px' }}>SELECT_OUTCOME:</div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button
                            onClick={() => setTradeOutcome('yes')}
                            style={{
                              flex: 1, padding: '16px', borderRadius: '8px', border: '1px solid rgba(0, 186, 124, 0.3)',
                              fontWeight: 900, fontSize: '0.8rem', fontFamily: '"Orbitron", sans-serif',
                              background: tradeOutcome === 'yes' ? '#00ba7c' : 'rgba(0, 186, 124, 0.05)',
                              color: tradeOutcome === 'yes' ? '#fff' : '#00ba7c', cursor: 'pointer',
                              boxShadow: tradeOutcome === 'yes' ? '0 0 20px rgba(0, 186, 124, 0.3)' : 'none',
                              transition: 'all 0.2s'
                            }}
                          >
                            YES ${(() => {
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
                  Select a market from the explorer
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {
        showCalculator && selectedMatch && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)',
            zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px',
            animation: 'fadeIn 0.3s'
          }}>
            <div style={{
              width: '100%', maxWidth: '900px', background: '#0d1117', border: '1px solid #30363d',
              borderRadius: '12px', overflow: 'hidden', boxShadow: '0 0 50px rgba(0,0,0,0.5)',
              display: 'flex', flexDirection: 'column'
            }}>
              {/* Header */}
              <div style={{
                padding: '16px 20px', background: '#161b22', borderBottom: '1px solid #30363d',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '1.2rem' }}>🏆</span>
                  <div>
                    <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#c9d1d9' }}>{selectedMatch.fliq.blockchainMetadata.parentQuestionHeader}</div>
                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.7rem', color: '#8b949e' }}>ARBITRAGE_STRATEGY: <span style={{ color: '#58a6ff' }}>{arbPlan?.strategy}</span></div>
                      <div style={{ fontSize: '0.65rem', color: '#58a6ff', fontWeight: 900, background: 'rgba(88, 166, 255, 0.1)', padding: '2px 6px', borderRadius: '4px' }}>
                        🕒 {new Date(parseInt(selectedMatch.fliq.blockchainMetadata.questionEndTime) * 1000).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setShowCalculator(false)}
                  style={{ background: 'transparent', border: 'none', color: '#8b949e', fontSize: '1.5rem', cursor: 'pointer' }}
                >×</button>
              </div>

              {/* Tabs */}
              <div style={{ display: 'flex', gap: '20px', padding: '12px 20px', borderBottom: '1px solid #21262d' }}>
                {['DETAILS', 'ORDER BOOK', 'CALCULATOR', 'SIMULATION', 'ARBITRAGE'].map(tab => (
                  <div
                    key={tab}
                    onClick={() => setCalcTab(tab)}
                    style={{
                      fontSize: '0.65rem', fontWeight: 900, color: calcTab === tab ? '#58a6ff' : '#8b949e',
                      fontFamily: '"Orbitron", sans-serif', letterSpacing: '1px', cursor: 'pointer',
                      position: 'relative'
                    }}>
                    {tab}
                    {tab === 'SIMULATION' && <div style={{ position: 'absolute', right: '-8px', top: '-4px', width: '4px', height: '4px', borderRadius: '50%', background: '#3fb950' }} />}
                    {calcTab === tab && <div style={{ height: '2px', background: '#58a6ff', marginTop: '4px' }} />}
                  </div>
                ))}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '12px', alignItems: 'center' }}>
                  <span style={{ fontSize: '0.65rem', color: '#3fb950', fontWeight: 900 }}>+$768.79</span>
                  <span style={{ fontSize: '0.65rem', color: '#3fb950', fontWeight: 900 }}>6.00%</span>
                </div>
              </div>

              {/* Fliq Budget Input (Independent Variable) */}
              <div style={{ padding: '20px' }}>
                <div style={{ fontSize: '0.65rem', color: '#8b949e', marginBottom: '8px', fontFamily: '"Orbitron", sans-serif' }}>⊙ FLIQ WAGER AMT ($)</div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <input
                    type="number"
                    value={calcWager}
                    onChange={(e) => setCalcWager(e.target.value)}
                    style={{
                      flex: 1, background: '#010409', border: '1px solid #30363d', borderRadius: '4px',
                      padding: '12px 16px', color: '#fff', fontSize: '1.2rem', fontWeight: 800,
                      fontFamily: '"Orbitron", sans-serif'
                    }}
                  />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    {[1, 3, 5, 10, 35].map(s => (
                      <button key={s} onClick={() => setCalcWager(s.toString())} style={{
                        background: '#21262d', border: '1px solid #30363d', borderRadius: '4px',
                        color: '#c9d1d9', padding: '0 12px', fontSize: '0.7rem', fontWeight: 600, cursor: 'pointer'
                      }}>${s}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Summary Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: '#30363d', borderBlock: '1px solid #30363d' }}>
                {[
                  { label: 'NET PNL', val: `$${formatPlanValue(arbPlan?.summary.netPnl || 0)}`, color: (arbPlan?.summary.netPnl || 0) > 0 ? '#3fb950' : '#f85149' },
                  { label: 'ROI', val: `${formatPlanValue(arbPlan?.summary.roi || 0)}%`, color: (arbPlan?.summary.roi || 0) > 0 ? '#3fb950' : '#f85149' },
                  { label: 'COST BASIS', val: `$${formatPlanValue(arbPlan?.summary.costBasis || 0)}`, color: '#fff' }
                ].map(item => (
                  <div key={item.label} style={{ background: '#0d1117', padding: '20px', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', color: '#8b949e', marginBottom: '8px', fontWeight: 900 }}>{item.label}</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: item.color, fontFamily: '"Orbitron", sans-serif' }}>{item.val}</div>
                  </div>
                ))}
              </div>

              {calcTab === 'SIMULATION' ? (
                <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
                  <div style={{ fontSize: '0.7rem', color: '#8b949e', marginBottom: '16px', fontWeight: 900, letterSpacing: '1px' }}>LIQUIDITY_SWEEP_MATRIX (BALANCED_SHARES)</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.75rem', fontFamily: '"Orbitron", sans-serif' }}>
                    <thead>
                      <tr style={{ background: '#161b22', borderBottom: '1px solid #30363d' }}>
                        {['FLIQ_AMT', 'FLIQ_SHARES', 'POLY_AMT', 'TOT_COST', 'ROI', 'NET_PNL'].map(h => (
                          <th key={h} style={{ padding: '12px', textAlign: 'left', color: '#8b949e' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {liquiditySim.map((sim, i) => (
                        <tr
                          key={i}
                          onClick={() => { setCalcWager(sim.budget.toString()); setCalcTab('CALCULATOR'); }}
                          style={{
                            borderBottom: '1px solid #21262d',
                            background: sim.budget === parseFloat(calcWager) ? 'rgba(88, 166, 255, 0.05)' : 'transparent',
                            cursor: 'pointer',
                            color: sim.netPnl > 0 ? '#3fb950' : '#8b949e'
                          }}>
                          <td style={{ padding: '12px', fontWeight: 800 }}>${sim.budget}</td>
                          <td style={{ padding: '12px' }}>{sim.fliqShares.toFixed(2)}</td>
                          <td style={{ padding: '12px' }}>${sim.polyCost.toFixed(2)}</td>
                          <td style={{ padding: '12px', color: '#c9d1d9' }}>${sim.totalCost.toFixed(2)}</td>
                          <td style={{ padding: '12px', fontWeight: 900 }}>{sim.roi.toFixed(2)}%</td>
                          <td style={{ padding: '12px', fontWeight: 900, color: sim.netPnl > (bestSim?.netPnl || 0) * 0.9 ? '#3fb950' : 'inherit' }}>
                            {sim.netPnl > 0 ? '+' : ''}${sim.netPnl.toFixed(4)}
                            {sim.budget === bestSim?.budget && <span style={{ marginLeft: '8px', fontSize: '0.6rem', padding: '2px 4px', background: 'rgba(63, 185, 80, 0.2)', borderRadius: '2px' }}>BEST</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', background: '#30363d', padding: '2px' }}>
                  {/* Fliq Column */}
                  <div style={{ background: '#0d1117', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                      <span style={{ color: '#3fb950', fontWeight: 900, fontSize: '0.8rem', letterSpacing: '1px' }}>FLIQ SIDE</span>
                      <span style={{ color: '#3fb950', fontWeight: 900, fontSize: '0.65rem' }}>{arbPlan?.fliq.side}</span>
                    </div>
                    {[
                      { l: 'AVG SHARE PRICE', v: `$${formatPlanValue(arbPlan?.fliq.avgPrice || 0)}` },
                      { l: 'SHARES TO BUY', v: formatPlanValue(arbPlan?.fliq.shares || 0), icon: true },
                      { l: 'TOTAL COST', v: `$${formatPlanValue(arbPlan?.fliq.cost || 0)}`, icon: true },
                      { l: 'EST. FEE (1.5%)', v: `-$${formatPlanValue(arbPlan?.fliq.fee || 0)}`, labelColor: '#f0883e' },
                      { l: 'TOTAL COST (INC. FEES)', v: `$${formatPlanValue(arbPlan?.fliq.totalCost || 0)}`, icon: true }
                    ].map(row => (
                      <div key={row.l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.8rem' }}>
                        <span style={{ color: row.labelColor || '#8b949e', fontWeight: 600 }}>{row.l}</span>
                        <span style={{ color: '#fff', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px' }}>
                          {row.v} {row.icon && <span style={{ fontSize: '0.7rem', opacity: 0.5 }}>📋</span>}
                        </span>
                      </div>
                    ))}
                    {arbPlan?.fliq.warning && (
                      <div style={{ padding: '8px', background: 'rgba(240, 136, 62, 0.1)', color: '#f0883e', fontSize: '0.65rem', border: '1px solid #f0883e', borderRadius: '4px', marginBottom: '12px' }}>
                        ⚠️ LIQUIDITY_WARNING: WAGER EXCEEDS TYPICAL FLIQ TOP-BOOK LIMITS ($35)
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #21262d' }}>
                      <span style={{ color: '#8b949e', fontWeight: 800 }}>TO RETURN</span>
                      <span style={{ color: '#fff', fontWeight: 800 }}>${formatPlanValue(arbPlan?.fliq.shares || 0)} <span style={{ color: '#3fb950' }}>[+${formatPlanValue((arbPlan?.fliq.shares || 0) - (arbPlan?.fliq.totalCost || 0))}]</span></span>
                    </div>
                    <button style={{
                      marginTop: '30px', width: '100%', padding: '14px', background: 'rgba(35, 134, 54, 0.4)',
                      color: '#3fb950', border: '1px solid #3fb950', borderRadius: '4px', fontWeight: 800,
                      fontSize: '0.9rem', cursor: 'pointer', transition: '0.2s', textTransform: 'uppercase'
                    }}>GO TO FLIQ_LOB ↗</button>
                  </div>

                  {/* Poly Column */}
                  <div style={{ background: '#0d1117', padding: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                      <span style={{ color: '#58a6ff', fontWeight: 900, fontSize: '0.8rem', letterSpacing: '1px' }}>POLYMARKET SIDE</span>
                      <span style={{ color: arbPlan?.poly.side === 'YES' ? '#3fb950' : '#f85149', fontWeight: 900, fontSize: '0.65rem' }}>{arbPlan?.poly.side}</span>
                    </div>
                    {[
                      { l: 'AVG SHARE PRICE', v: `$${formatPlanValue(arbPlan?.poly.avgPrice || 0)}` },
                      { l: 'SHARES TO BUY', v: formatPlanValue(arbPlan?.poly.shares || 0) },
                      { l: 'TOTAL COST', v: `$${formatPlanValue(arbPlan?.poly.cost || 0)}` },
                      { l: 'EST. FEE', v: '$0', labelColor: '#f0883e' },
                      { l: 'TOTAL COST (INC. FEES)', v: `$${formatPlanValue(arbPlan?.poly.totalCost || 0)}` }
                    ].map(row => (
                      <div key={row.l} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', fontSize: '0.8rem' }}>
                        <span style={{ color: row.labelColor || '#8b949e', fontWeight: 600 }}>{row.l}</span>
                        <span style={{ color: '#fff', fontWeight: 700 }}>{row.v}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '20px', paddingTop: '20px', borderTop: '1px solid #21262d' }}>
                      <span style={{ color: '#8b949e', fontWeight: 800 }}>TO RETURN</span>
                      <span style={{ color: '#fff', fontWeight: 800 }}>${formatPlanValue(arbPlan?.poly.shares || 0)} <span style={{ color: '#3fb950' }}>[+${formatPlanValue((arbPlan?.poly.shares || 0) - (arbPlan?.poly.totalCost || 0))}]</span></span>
                    </div>
                    <button style={{
                      marginTop: '30px', width: '100%', padding: '14px', background: 'rgba(31, 111, 235, 0.4)',
                      color: '#58a6ff', border: '1px solid #58a6ff', borderRadius: '4px', fontWeight: 800,
                      fontSize: '0.9rem', cursor: 'pointer', transition: '0.2s', textTransform: 'uppercase'
                    }}>GO TO POLY_LOB ↗</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )
      }

      <style>{`
        ::-webkit-scrollbar { width: 8px; }
        ::-webkit-scrollbar-track { background: #0d1117; }
        ::-webkit-scrollbar-thumb { background: #30363d; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #58a6ff; }
        
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        tr:hover {
          background: rgba(88, 166, 255, 0.05);
        }
        
        button:active {
          transform: scale(0.98);
        }
      `}</style>
    </div >
  );
}
