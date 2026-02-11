import type { FliqQuestion } from './fliq';
import type { PolyMarket } from './poly';

export interface MatchResult {
    fliq: FliqQuestion;
    poly: PolyMarket;
    score: number;
}

const SPORTS_SYNONYMS: Record<string, string> = {
    'man city': 'manchester city',
    'man utd': 'manchester united',
    'spurs': 'tottenham hotspur',
    'wolves': 'wolverhampton wanderers',
    'leicester': 'leicester city',
    'brighton': 'brighton hove albion',
    'west ham': 'west ham united',
    'forest': 'nottingham forest',
    'nufc': 'newcastle united',
    'lfc': 'liverpool',
    'mcfc': 'manchester city',
    'mufc': 'manchester united'
};

const STOP_WORDS = new Set(['to', 'win', 'against', 'will', 'be', 'the', 'at', 'in', 'score', 'goals', 'more', 'than', 'a', 'an', 'and']);

const normalizeText = (s: string): string => {
    if (!s) return '';
    let normalized = s.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Replace synonyms
    Object.entries(SPORTS_SYNONYMS).forEach(([search, replace]) => {
        normalized = normalized.replace(new RegExp(`\\b${search}\\b`, 'g'), replace);
    });

    return normalized;
};

const cleanTokens = (s: string): string[] => {
    return normalizeText(s).split(' ')
        .filter(word => word && !STOP_WORDS.has(word));
};

export const extractTeams = (text: string): [string, string] | [null, null] => {
    if (!text) return [null, null];
    const t = text.toLowerCase().replace(/\s+/g, ' ').trim();

    const delimiters = [' vs ', ' v ', ' versus ', ' @ ', ' at ', ' against ', ' beat ', ' and '];
    for (const d of delimiters) {
        if (t.includes(d)) {
            const parts = t.split(d);
            if (parts.length >= 2) {
                return [parts[0].trim(), parts[1].trim()];
            }
        }
    }
    return [null, null];
};

const tokenSimilarity = (a: string, b: string): number => {
    if (!a || !b) return 0.0;
    const tokensA = cleanTokens(a);
    const tokensB = cleanTokens(b);

    if (tokensA.join(' ') === tokensB.join(' ')) return 1.0;
    if (tokensA.length === 0 || tokensB.length === 0) return 0.0;

    const setA = new Set(tokensA);
    const setB = new Set(tokensB);
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    return (2.0 * intersection.size) / (setA.size + setB.size);
};

const teamOverlapScore = (fliqTitle: string, polyTitle: string): number => {
    if (!fliqTitle || !polyTitle) return 0.0;
    const [fa, fb] = extractTeams(fliqTitle);
    const [pa, pb] = extractTeams(polyTitle);

    // Case 1: Both are match-ups (Team A vs Team B)
    if (fa && fb && pa && pb) {
        const scores = [
            tokenSimilarity(fa, pa) + tokenSimilarity(fb, pb),
            tokenSimilarity(fa, pb) + tokenSimilarity(fb, pa)
        ];
        return Math.max(...scores) / 2.0;
    }

    // Case 2: One is a single participant market (e.g. "Will Man City win?")
    // We check if the Poly title mentions either of the Fliq teams
    if (fa && fb) {
        const pTokens = cleanTokens(polyTitle).join(' ');
        const scoreA = tokenSimilarity(fa, pTokens);
        const scoreB = tokenSimilarity(fb, pTokens);

        // If Poly title contains a team name from Fliq match, that's a strong signal
        // We set a floor here if the token similarity is high enough
        const bestScore = Math.max(scoreA, scoreB);
        if (bestScore > 0.6) return 0.8;
        return bestScore;
    }

    // Fallback to general token similarity on whole titles
    return tokenSimilarity(fliqTitle, polyTitle);
};

const dateProximityScore = (fliqEndTime: string, polyStart: string): number => {
    if (!fliqEndTime || !polyStart) return 0.0;

    try {
        const fliqTs = parseInt(fliqEndTime) * 1000;
        const polyTs = new Date(polyStart).getTime();

        if (isNaN(fliqTs) || isNaN(polyTs)) return 0.0;

        const diffHours = Math.abs(fliqTs - polyTs) / (1000 * 60 * 60);

        if (diffHours <= 6) return 1.0;
        if (diffHours <= 24) return 0.6;
        if (diffHours <= 48) return 0.3;
        return 0.0;
    } catch {
        return 0.0;
    }
};

export const computeMatchScore = (fliq: FliqQuestion, poly: PolyMarket): number => {
    if (!fliq || !poly) return 0.0;
    const bm = fliq.blockchainMetadata || {};
    const fliqTitle = bm.parentQuestionHeader || bm.questionHeader || '';
    const polyTitle = poly.title || poly.question || '';

    if (!fliqTitle || !polyTitle) return 0.0;

    let score = 0.0;

    // 1. Team overlap (Weight: 0.6)
    score += 0.6 * teamOverlapScore(fliqTitle, polyTitle);

    // 2. Date proximity (Weight: 0.3)
    score += 0.3 * dateProximityScore(
        bm.questionEndTime,
        poly.startDate
    );

    // 3. Competition hint (Weight: 0.1)
    const fliqHeaderLow = fliqTitle.toLowerCase();
    const polyTags = (poly.tags || []).map(t => (t.label || '').toLowerCase());
    if (polyTags.some(tag => tag && fliqHeaderLow.includes(tag))) {
        score += 0.1;
    }

    return Math.round(score * 1000) / 1000;
};

export const calculateEffectivePrice = (
    levels: { price: number; size: number }[],
    targetSize: number
): number | null => {
    let remainingSize = targetSize;
    let totalCost = 0;

    for (const level of levels) {
        const take = Math.min(remainingSize, level.size);
        totalCost += take * level.price;
        remainingSize -= take;

        if (remainingSize <= 0) break;
    }

    if (remainingSize > 0) return null; // Not enough liquidity
    return totalCost / targetSize;
};

export const calculateArb = (
    fliqPrice: number,
    polyPrice: number
) => {
    // Basic arb detection: If we can buy on A and sell on B for profit
    // Or buy Yes on A and Yes on B where sum of prices < 1 (if they were the same market)
    // But here they are the same market, so we want price difference.
    const spread = Math.abs(fliqPrice - polyPrice);
    const profitPercent = (spread / Math.min(fliqPrice, polyPrice)) * 100;

    return {
        spread,
        profitPercent: profitPercent.toFixed(2) + '%'
    };
};

/**
 * Prepares a structured summary of a match for final verification.
 * This can be used by an LLM to evaluate the logical consistency of a pairing.
 */
export const summarizeForLLM = (match: MatchResult) => {
    return {
        fliq: {
            id: match.fliq.questionId,
            title: match.fliq.blockchainMetadata.questionHeader,
            parent: match.fliq.blockchainMetadata.parentQuestionHeader,
            endTime: new Date(parseInt(match.fliq.blockchainMetadata.questionEndTime) * 1000).toISOString()
        },
        poly: {
            id: match.poly.id,
            title: match.poly.title,
            startDate: match.poly.startDate,
            outcomes: match.poly.outcomes
        },
        confidenceScore: match.score,
        assessmentHints: [
            "Check if both describe the same event and outcome side.",
            "Verify that timestamps are roughly aligned (same day/match).",
            "Ensure 'Yes' on Fliq represents the same winner as 'Yes' on Poly."
        ]
    };
};
