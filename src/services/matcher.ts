import type { FliqQuestion } from './fliq';
import type { PolyMarket } from './poly';

export interface MatchResult {
    fliq: FliqQuestion;
    poly: PolyMarket;
    score: number;
}

const normalizeText = (s: string): string => {
    return s
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
};

const extractTeams = (text: string): [string, string] | [null, null] => {
    const t = normalizeText(text);
    if (t.includes(' vs ')) {
        const parts = t.split(' vs ');
        return [parts[0].trim(), parts[1].trim()];
    }
    if (t.includes(' v ')) {
        const parts = t.split(' v ');
        return [parts[0].trim(), parts[1].trim()];
    }
    return [null, null];
};

const tokenSimilarity = (a: string, b: string): number => {
    if (a === b) return 1.0;
    if (!a || !b) return 0.0;

    // Simple token overlap for now (can be improved with Levenshtein)
    const setA = new Set(a.split(' '));
    const setB = new Set(b.split(' '));
    const intersection = new Set([...setA].filter(x => setB.has(x)));
    return (2.0 * intersection.size) / (setA.size + setB.size);
};

const teamOverlapScore = (fliqTitle: string, polyTitle: string): number => {
    const [fa, fb] = extractTeams(fliqTitle);
    const [pa, pb] = extractTeams(polyTitle);

    if (!fa || !fb || !pa || !pb) return 0.0;

    const scores = [
        tokenSimilarity(fa, pa) + tokenSimilarity(fb, pb),
        tokenSimilarity(fa, pb) + tokenSimilarity(fb, pa)
    ];

    return Math.max(...scores) / 2.0;
};

const dateProximityScore = (fliqEndTime: string, polyStart: string): number => {
    if (!fliqEndTime || !polyStart) return 0.0;

    try {
        const fliqTs = parseInt(fliqEndTime) * 1000;
        const polyTs = new Date(polyStart).getTime();

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
    let score = 0.0;

    // 1. Team overlap (Weight: 0.6)
    score += 0.6 * teamOverlapScore(
        fliq.blockchainMetadata.parentQuestionHeader,
        poly.title
    );

    // 2. Date proximity (Weight: 0.3)
    score += 0.3 * dateProximityScore(
        fliq.blockchainMetadata.questionEndTime,
        poly.startDate
    );

    // 3. Competition hint (Weight: 0.1)
    const fliqHeader = fliq.blockchainMetadata.parentQuestionHeader.toLowerCase();
    const polyTags = (poly.tags || []).map(t => t.label.toLowerCase());
    if (polyTags.some(tag => fliqHeader.includes(tag))) {
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
