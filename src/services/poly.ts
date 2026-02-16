import axios from 'axios';

const POLY_API = '/api/poly/markets';

export interface PolyToken {
    token_id: string;
    outcome: string;
    price: number;
    winner: boolean;
}

export interface PolyMarket {
    id: string;
    title?: string;
    question?: string;
    description: string;
    startDate: string;
    endDate: string;
    active: boolean;
    closed: boolean;
    tags: { id: string; label: string }[];
    outcomes: string[];
    outcomePrices: string[]; // e.g. ["0.5", "0.5"]
    tokens: PolyToken[];
}

export interface PolyOrderbookLevel {
    price: string;
    size: string;
}

export interface PolyOrderbook {
    bids: PolyOrderbookLevel[];
    asks: PolyOrderbookLevel[];
}

export const fetchPolyOrderbook = async (tokenId: string): Promise<PolyOrderbook | null> => {
    const url = `/api/poly-clob/book?token_id=${tokenId}`;
    try {
        const response = await axios.get<PolyOrderbook>(url);
        return response.data || null;
    } catch (error) {
        console.error('Error fetching Poly orderbook:', error);
        return null;
    }
};

const normalizePolyMarket = (m: any): PolyMarket => {
    const parseArray = (val: any) => {
        if (typeof val === 'string') {
            try { return JSON.parse(val); } catch (e) { return []; }
        }
        return val || [];
    };

    return {
        ...m,
        id: m.id || m.market_id || m.token_id,
        title: m.title || m.question || '',
        outcomes: parseArray(m.outcomes),
        outcomePrices: parseArray(m.outcomePrices || m.outcome_prices),
        tokens: m.tokens || [],
        tags: m.tags || [],
        startDate: m.startDate || m.startDateIso || m.start_date || '',
        endDate: m.endDate || m.endDateIso || m.end_date || ''
    };
};

export const searchPolyMarkets = async (query: string): Promise<PolyMarket[]> => {
    try {
        const response = await axios.get('/api/poly/public-search', {
            params: {
                q: query,
                optimized: 'true',
                type: 'events',
                limit_per_type: 10
            }
        });

        const events = response.data?.events || [];
        if (events.length === 0) return [];

        const marketPromises = events.map((event: any) =>
            axios.get(`/api/poly/events/${event.id}`).then(res => {
                const markets = res.data?.markets || [];
                const eventContext = res.data?.title || res.data?.name || event.title || '';
                return markets.map((m: any) => ({
                    ...m,
                    title: `${eventContext}: ${m.title || m.question || ''}`.trim(),
                    description: `${eventContext} ${m.description || ''}`.trim()
                }));
            }).catch(() => [])
        );

        const marketsArrays = await Promise.all(marketPromises);
        return marketsArrays.flat().map(normalizePolyMarket);
    } catch (error) {
        console.error('Error searching Poly markets:', error);
        return [];
    }
};

export const fetchPolyMarkets = async (limit = 100, offset = 0, search?: string): Promise<PolyMarket[]> => {
    let allMarkets: PolyMarket[] = [];
    let currentOffset = offset;
    const pageSize = 100;

    try {
        while (allMarkets.length < limit) {
            const response = await axios.get(POLY_API, {
                params: {
                    active: 'true',
                    closed: 'false',
                    limit: Math.min(pageSize, limit - allMarkets.length),
                    offset: currentOffset,
                    ...(search ? { search } : {})
                }
            });
            const markets = response.data || [];
            if (markets.length === 0) break;

            allMarkets = [...allMarkets, ...markets.map(normalizePolyMarket)];
            if (markets.length < pageSize) break;
            currentOffset += pageSize;
        }
        return allMarkets;
    } catch (error) {
        console.error('Error fetching Poly markets:', error);
        return allMarkets;
    }
};

export const filterPolyMarkets = (markets: PolyMarket[]) => {
    const CATEGORY_HINTS = [
        'la liga', 'premier league', 'epl', 'bundesliga', 'serie a',
        'ligue', 'champions', 'europa', 'laliga', 'nba', 'basketball',
        'super bowl', 'nfl', 'election', 'trump', 'biden', 'crypto', 'bitcoin', 'eth'
    ];

    return markets.filter(m => {
        const title = (m.title || m.question || '').toLowerCase();
        const description = (m.description || '').toLowerCase();
        const tags = (m.tags || []).map(t => t.label.toLowerCase());

        const matchesHint = CATEGORY_HINTS.some(hint =>
            description.includes(hint) || title.includes(hint) || tags.includes(hint)
        );

        // For sports, we look for ' vs ' or ' v '
        const isMatch = title.includes(' vs ') || title.includes(' v ') || title.includes(' and ') || title.includes(' against ');

        // Return if it matches any category hint OR is a match-up
        return matchesHint || isMatch;
    });
};

export const fetchPolyPrice = async (tokenId: string): Promise<number | null> => {
    if (!tokenId) return null;
    const book = await fetchPolyOrderbook(tokenId);
    if (!book || !book.asks || book.asks.length === 0) return null;

    // For arbitrage, we usually want to know the price we can BUY at (lowest Ask)
    // or SELL at (highest Bid). Let's return the best Ask (lowest price to buy)
    const bestAsk = book.asks.sort((a, b) => parseFloat(a.price) - parseFloat(b.price))[0];
    return bestAsk ? parseFloat(bestAsk.price) : null;
};
