import axios from 'axios';

const API_BASE = '/api/fliq/question';

export interface FliqQuestion {
    questionId: string;
    lotSize: string;
    tickSize: string;
    decimal: string;
    isSettled: boolean;
    settlementPrice: string;
    contractAddress: string;
    yesTokenMarketId: string;
    noTokenMarketId: string;
    blockchainMetadata: {
        parentQuestionId: string;
        questionHeader: string;
        parentQuestionHeader: string;
        questionHeaderExpanded: string;
        category: string;
        tags: string[];
        questionEndTime: string;
        imgUrl: string;
    };
}

export const fetchFliqQuestions = async (limit = 2000): Promise<FliqQuestion[]> => {
    const params = new URLSearchParams();
    const selectors = [
        'questionId', 'lotSize', 'tickSize', 'decimal', 'isSettled',
        'settlementPrice', 'contractAddress', 'yesTokenMarketId', 'noTokenMarketId',
        'blockchainMetadata', 'category'
    ];

    selectors.forEach(s => params.append('select', s));
    params.append('limit', limit.toString());
    params.append('sortBy', 'questionEndTime');
    params.append('sortOrder', 'asc');
    params.append('isSettled', 'false'); // Only fetch active markets

    try {
        const response = await axios.get(API_BASE, { params });
        return response.data.questions || [];
    } catch (error) {
        console.error('Error fetching Fliq questions:', error);
        return [];
    }
};



export const filterFliqMatches = (questions: FliqQuestion[]) => {
    const nowTs = Math.floor(Date.now() / 1000);

    // Categories to exclude (rapid price prediction markets)
    const excludedCategories = ['5 min', '15 min', 'up down'];

    // Keywords in headers to exclude
    const excludedKeywords = ['passes', 'pass against'];

    const filtered = questions
        .filter(q => {
            const bm = q.blockchainMetadata || {};
            const category = (bm.category || '').toLowerCase();

            // Exclude rapid BTC/ETH markets
            if (excludedCategories.includes(category)) return false;

            // Check tags for crypto rapid markers
            const tags = (bm.tags || []).map(t => t.toLowerCase());
            if (tags.some(t => t.includes('btc') || t.includes('eth') || t.includes('5 min') || t.includes('15 min'))) {
                return false;
            }

            // Check headers for excluded keywords (passes, etc.)
            const headers = [
                bm.questionHeader,
                bm.parentQuestionHeader,
                bm.questionHeaderExpanded
            ].filter(Boolean).join(' ').toLowerCase();

            if (excludedKeywords.some(kw => headers.includes(kw))) {
                return false;
            }

            const isNotSettled = !q.isSettled;
            const hasEndTime = !!bm.questionEndTime;

            if (!hasEndTime) return false;

            const endTs = parseInt(bm.questionEndTime);
            const isFuture = endTs > nowTs;

            // Only include markets ending in the future (not expired)
            return isNotSettled && isFuture;
        })
        .sort((a, b) => {
            const timeA = parseInt(a.blockchainMetadata.questionEndTime || '0');
            const timeB = parseInt(b.blockchainMetadata.questionEndTime || '0');
            return timeA - timeB; // Ending soon first
        });

    // Deduplicate multi-question markets by parentQuestionId
    const seen = new Set<string>();
    return filtered.filter(q => {
        const bm = q.blockchainMetadata || {};
        const key = bm.parentQuestionId || q.questionId;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};




export interface FliqOrderbookLevel {
    market_id: number;
    direction: 'bid' | 'ask';
    price: number;
    total_size: number;
    version: number;
}

export const fetchFliqOrderbook = async (marketIds: string[]): Promise<FliqOrderbookLevel[]> => {
    if (marketIds.length === 0) return [];

    const ids = marketIds.join(',');
    const bidsUrl = `/api/fliq-dss/price_levels?and=(market_id.in.(${ids}),direction.eq.bid)&order=price.desc&limit=60`;
    const asksUrl = `/api/fliq-dss/price_levels?and=(market_id.in.(${ids}),direction.eq.ask)&order=price.asc&limit=60`;

    try {
        const [bidsRes, asksRes] = await Promise.all([
            axios.get<FliqOrderbookLevel[]>(bidsUrl),
            axios.get<FliqOrderbookLevel[]>(asksUrl)
        ]);
        return [...(bidsRes.data || []), ...(asksRes.data || [])];
    } catch (error) {
        console.error('Error fetching Fliq orderbook:', error);
        return [];
    }
};
