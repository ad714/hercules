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
    category: string;
    totalVolume: string;
    quoteVol24h: string;
    createdAt: string;
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


export const fetchFliqQuestions = async (limit = 5000): Promise<FliqQuestion[]> => {
    const params = new URLSearchParams();
    const selectors = [
        'questionId', 'lotSize', 'tickSize', 'decimal', 'isSettled',
        'settlementPrice', 'contractAddress', 'yesTokenMarketId', 'noTokenMarketId',
        'blockchainMetadata', 'category', 'totalVolume', 'quoteVol24h', 'createdAt'
    ];

    selectors.forEach(s => params.append('select', s));
    params.append('limit', limit.toString());
    params.append('isSettled', 'false'); // Crucial: only active trading markets
    params.append('sortBy', 'createdAt'); // Recently created first to catch new trends
    params.append('sortOrder', 'desc');

    try {
        const response = await axios.get(API_BASE, { params });
        return response.data.questions || [];
    } catch (error) {
        console.error('Error fetching Fliq questions:', error);
        return [];
    }
};




const REGEX_BENGALI = /[\u0980-\u09FF]/;

export const filterFliqMatches = (questions: FliqQuestion[]) => {
    const nowTs = Math.floor(Date.now() / 1000);

    // Categories to exclude (rapid price prediction markets)
    const excludedCategories = ['5 min', '15 min', 'up down'];

    // Precise word boundaries to avoid false positives like "Compass" or "bypass"
    const PASS_METRIC_REGEX = /\b(pass|passes|pass against|pass attempts)\b/i;

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

            // Check headers for excluded keywords (passes, etc.) and Bengali characters
            const headers = [
                bm.questionHeader,
                bm.parentQuestionHeader,
                bm.questionHeaderExpanded
            ].filter(Boolean).join(' ').toLowerCase();

            if (PASS_METRIC_REGEX.test(headers)) {
                return false;
            }

            if (REGEX_BENGALI.test(headers)) {
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
    cumulative_size?: number; // Calculated field
}

export const fetchFliqOrderbook = async (marketId: string | number): Promise<FliqOrderbookLevel[]> => {
    if (!marketId) return [];

    const bidsUrl = `/api/fliq-dss/price_levels?market_id=eq.${marketId}&direction=eq.bid&order=price.desc&limit=30`;
    const asksUrl = `/api/fliq-dss/price_levels?market_id=eq.${marketId}&direction=eq.ask&order=price.asc&limit=30`;

    try {
        const [bidsRes, asksRes] = await Promise.all([
            axios.get<FliqOrderbookLevel[]>(bidsUrl),
            axios.get<FliqOrderbookLevel[]>(asksUrl)
        ]);

        // Calculate cumulative size for bids
        let bidSum = 0;
        const bids = (bidsRes.data || []).map(lvl => {
            bidSum += lvl.total_size;
            return { ...lvl, cumulative_size: bidSum };
        });

        // Calculate cumulative size for asks
        let askSum = 0;
        const asks = (asksRes.data || []).map(lvl => {
            askSum += lvl.total_size;
            return { ...lvl, cumulative_size: askSum };
        });

        return [...bids, ...asks];
    } catch (error) {
        console.error('Error fetching Fliq orderbook:', error);
        return [];
    }
};

