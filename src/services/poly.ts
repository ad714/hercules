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
            axios.get(`/api/poly/events/${event.id}`).then(res => res.data?.markets || []).catch(() => [])
        );

        const marketsArrays = await Promise.all(marketPromises);
        return marketsArrays.flat();
    } catch (error) {
        console.error('Error searching Poly markets:', error);
        return [];
    }
};

export const fetchPolyMarkets = async (limit = 100, offset = 0, search?: string): Promise<PolyMarket[]> => {
    try {
        const response = await axios.get(POLY_API, {
            params: {
                active: 'true',
                closed: 'false',
                limit,
                offset,
                ...(search ? { search } : {})
            }
        });
        return response.data || [];
    } catch (error) {
        console.error('Error fetching Poly markets:', error);
        return [];
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
