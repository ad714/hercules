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
    title: string;
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

export const fetchPolyMarkets = async (limit = 100, offset = 0): Promise<PolyMarket[]> => {
    try {
        const response = await axios.get(POLY_API, {
            params: {
                active: 'true',
                closed: 'false',
                limit,
                offset,
            }
        });
        return response.data || [];
    } catch (error) {
        console.error('Error fetching Poly markets:', error);
        return [];
    }
};

export const filterPolyFootball = (markets: PolyMarket[]) => {
    const FOOTBALL_LEAGUE_HINTS = [
        'la liga', 'premier league', 'epl', 'bundesliga', 'serie a',
        'ligue', 'champions', 'europa', 'laliga'
    ];

    return markets.filter(m => {
        const title = (m.title || '').toLowerCase();
        const description = (m.description || '').toLowerCase();

        const isMatch = title.includes(' vs ') || title.includes(' v ');
        const looksLikeFootball = FOOTBALL_LEAGUE_HINTS.some(hint =>
            description.includes(hint) || title.includes(hint)
        );

        return isMatch && looksLikeFootball;
    });
};
