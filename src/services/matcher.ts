import type { FliqQuestion } from './fliq';
import type { PolyMarket } from './poly';
import {
    TEAM_SYNONYMS,
    EXCLUDED_KEYWORDS,
    POLITICS_KEYWORDS,
    SPORTS_KEYWORDS,
    STOP_WORDS,
    LEAGUE_NORMALIZATIONS
} from './knowledge';

const STOP_WORDS_SET = new Set(STOP_WORDS);

export interface MatchTrust {
    title: number;
    criteria: number;
    dates: number;
    overall: number;
}

export interface MatchResult {
    fliq: FliqQuestion;
    poly: PolyMarket;
    score: number;
    trust?: MatchTrust;
}

const normalizeText = (s: string): string => {
    if (!s) return '';
    let normalized = s.toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // Map all versions of a team to the same canonical name
    Object.entries(TEAM_SYNONYMS).forEach(([canonical, aliases]) => {
        aliases.forEach(alias => {
            normalized = normalized.replace(new RegExp(`\\b${alias}\\b`, 'g'), canonical);
        });
    });

    return normalized;
};

const cleanTokens = (s: string): string[] => {
    return normalizeText(s).split(' ')
        .filter(word => word && !STOP_WORDS_SET.has(word));
};

const stripTeamJunk = (team: string): string => {
    return team
        .replace(/,.*$/, '') // Strip after comma
        .replace(/\b\d+(th|st|rd|nd)?\b.*/g, '') // Strip dates (16th Feb etc)
        .replace(/\b(serie a|premier league|la liga|bundesliga|league|cup|championship|laliga)\b.*/ig, '') // Strip leagues
        .trim();
};

export const extractTeams = (text: string): [string, string] | [null, null] => {
    if (!text) return [null, null];
    const t = text.toLowerCase()
        .replace(/\bvs\b/g, ' vs ')
        .replace(/\bv\b/g, ' vs ')
        .replace(/\bversus\b/g, ' vs ')
        .replace(/\band\b/g, ' vs ')
        .replace(/\s+/g, ' ').trim();

    if (t.includes(' vs ')) {
        const parts = t.split(' vs ');
        if (parts.length >= 2) {
            return [stripTeamJunk(parts[0]), stripTeamJunk(parts[1])];
        }
    }

    const secondaryDelimiters = [' @ ', ' at ', ' against ', ' beat ', ' vs. '];
    for (const d of secondaryDelimiters) {
        if (t.includes(d)) {
            const parts = t.split(d);
            if (parts.length >= 2) {
                return [stripTeamJunk(parts[0]), stripTeamJunk(parts[1])];
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

    const nPoly = normalizeText(polyTitle);

    const isMatchUp = (s: string) => /\b(vs|v|at|@|against|vs.)\b/i.test(s);

    if ((fa && fb) || isMatchUp(fliqTitle)) {
        if (!fa || !fb) return 0.0; // Block fallback if it's a matchup

        const nFliqA = cleanTokens(fa).join(' ');
        const nFliqB = cleanTokens(fb).join(' ');

        const hasA = nPoly.includes(nFliqA);
        const hasB = nPoly.includes(nFliqB);

        // Required: At least one team must match.
        // If the Poly title is ALSO a match-up, both must match to prevent cross-match noise.
        const polyIsMU = isMatchUp(polyTitle);
        if (polyIsMU) {
            if (!hasA || !hasB) return 0.0;
        } else {
            if (!hasA && !hasB) return 0.0;
        }

        // For Match-up vs Match-up (GAME vs GAME)
        if (pa && pb) {
            const nPolyA = normalizeText(pa);
            const nPolyB = normalizeText(pb);

            // Exact Match (including flipped order)
            const exactMatch = (nPolyA === nFliqA && nPolyB === nFliqB) || (nPolyA === nFliqB && nPolyB === nFliqA);
            if (exactMatch) return 1.0;

            // Substring Match (e.g. Manchester City vs Man City)
            const containsBoth = (nPolyA.includes(nFliqA) || nFliqA.includes(nPolyA)) && (nPolyB.includes(nFliqB) || nFliqB.includes(nPolyB));
            const containsBothFlipped = (nPolyA.includes(nFliqB) || nFliqB.includes(nPolyA)) && (nPolyB.includes(nFliqA) || nFliqA.includes(nPolyB));

            if (containsBoth || containsBothFlipped) return 1.0;

            // Fuzzy match for teams
            if ((hasA && hasB)) return 0.95;
            return 0.0; // Team mismatch - hard kill
        }

        // For Match-up vs Single (WINNER / SEASON)
        // Require at least one team to be explicitly present
        if (hasA || hasB) return 0.8;
        return 0.0; // No teams found - hard kill
    }

    // Single participant Fliq vs Poly
    if (fa && !fb) {
        const nFliq = normalizeText(fa);
        if (nPoly.includes(nFliq)) return 0.9;
        return 0.0;
    }

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

const normalizeMarketTitle = (title: string) => {
    return title.toLowerCase()
        .replace(/will|be|the|at|against|vs|v|versus|and/g, '')
        .replace(/\s+/g, ' ')
        .trim();
};

export type MarketClass = 'GAME' | 'SEASON' | 'GOALS' | 'BTTS' | 'WINNER' | 'EXCLUDED' | 'UNKNOWN';

export const identifyMarketClass = (title: string, desc: string = ''): MarketClass => {
    const text = (title + ' ' + desc).toLowerCase();

    // 1. EXCLUDED (Bullshit markets we don't trade on Poly)
    if (/(cards|corners|offsides|passes|yellow card|red card|free kick|throw in|substitution|possession|tackle|foul|player to|to score|goalscorer|anytime scorer|rebounds|assists|blocks|steals|points|double double|triple double|rebs|ast|pts|play for|transfer to|sign with|next team|to win|will win|next club)/i.test(text)) {
        return 'EXCLUDED';
    }

    // 2. Seasonal/Futures
    if (/(win|winner|to win) (the |)(league|championship|finals|cup|la liga|premier league|nba finals|ucl|serie a|bundesliga|scudetto|world cup)/i.test(text)) {
        return 'SEASON';
    }

    // 3. Specific Sports (NBA check)
    if (text.includes('nba') || /lakers|celtics|warriors|bulls|knicks|cavs|hawks|76ers|nets|thunder/.test(text)) {
        if (!text.includes(' vs ') && !text.includes(' @ ')) return 'SEASON'; // Likely a future if no vs
    }

    // 4. BTTS (Both Teams To Score)
    if (/(both teams to score|btts|both will score)/i.test(text)) {
        return 'BTTS';
    }

    // 5. Goals (Over/Under or Count)
    if (/(goals|score|total goals|totals|over |under | or more goals)/i.test(text)) {
        return 'GOALS';
    }

    // 6. Winner (Match Outcome)
    if (/\b(win|winner|beat|victory|draw|tie|defeat)\b/i.test(text)) {
        return 'WINNER';
    }

    // 7. Match-up indicators (General Event)
    if (/\b(vs|v|at|@|against|versus)\b/i.test(text)) {
        return 'GAME';
    }

    return 'UNKNOWN';
};

export const computeMatchScore = (fliq: FliqQuestion, poly: PolyMarket): number => {
    if (!fliq || !poly) return 0.0;
    const bm = fliq.blockchainMetadata || {};

    // Fliq Components
    const fEvent = bm.parentQuestionHeader || bm.questionHeader || '';
    const fMarket = bm.questionHeader || '';
    const fDesc = bm.questionHeaderExpanded || '';

    // Poly Components
    const pTitle = poly.title || poly.question || '';
    const pDesc = poly.description || '';
    const pOutcomes = Array.isArray(poly.outcomes) ? poly.outcomes.join(' ') : (typeof poly.outcomes === 'string' ? poly.outcomes : '');

    if (!fEvent || !pTitle) return 0.0;

    const isMU = (s: string) => /\b(vs|v|at|@|against|vs.)\b/i.test(s);

    // 0. Sport Guard (Topic Isolation)
    const detectSport = (text: string): string => {
        const t = text.toLowerCase();
        if (t.includes('cricket') || t.includes('t20') || t.includes('icc') || t.includes('test match') || t.includes('ipl') || t.includes('zimbabwe') || t.includes('sri lanka') || t.includes('odi')) return 'CRICKET';
        if (t.includes('nba') || t.includes('basketball') || t.includes('lakers') || t.includes('clippers') || t.includes('warriors') || t.includes('celtics') || t.includes('knicks') || t.includes('bulls')) return 'BASKETBALL';
        if (t.includes('football') || t.includes('soccer') || t.includes('premier league') || t.includes('ucl') || t.includes('laliga') || t.includes('bundesliga') || t.includes('serie a') || t.includes('milano') || t.includes('inter ') || t.includes(' lafc ') || t.includes(' mls ') || t.includes('real madrid') || t.includes('barcelona') || t.includes('liverpool') || t.includes('arsenal') || t.includes('man city')) return 'FOOTBALL';
        if (t.includes('nfl') || t.includes('super bowl')) return 'NFL';
        return 'UNKNOWN';
    };

    const fSport = detectSport(fEvent + ' ' + fDesc);
    const pSport = detectSport(pTitle + ' ' + pDesc);
    if (fSport !== 'UNKNOWN' && pSport !== 'UNKNOWN' && fSport !== pSport) return 0.0;

    // 1. Title Similarity (Trust Point 1)
    const nFliq = normalizeMarketTitle(fEvent);
    const nPoly = normalizeMarketTitle(pTitle);

    // Check for league/synonym overlaps
    let synonymMatch = 0;
    Object.entries(LEAGUE_NORMALIZATIONS).forEach(([synonym, canonical]) => {
        if (nFliq.includes(synonym) || nFliq.includes(canonical as string)) {
            if (nPoly.includes(synonym) || nPoly.includes(canonical as string)) synonymMatch = 0.1;
        }
    });

    const titleScore = teamOverlapScore(fEvent, pTitle + ' ' + pDesc) + synonymMatch;

    // PARTICIPANT LOCK: If no teams or subjects align, kill the entire match
    if (titleScore === 0) {
        if (isMU(fEvent)) console.log(`[Matcher] Hard-Kill on titleScore=0: ${fEvent} vs [${pTitle}]`);
        return 0.0;
    }

    // NUCLEAR OVERRIDE: If teams don't align in a match-up, KILL the entire match
    if (isMU(fEvent) && teamOverlapScore(fEvent, pTitle + ' ' + pDesc) === 0) {
        console.log(`[Matcher] Nuclear Hard-Kill (Matchup): ${fEvent} vs [${pTitle}]`);
        return 0.0;
    }

    // 2. Date Alignment (Trust Point 2)
    const dateScore = dateProximityScore(bm.questionEndTime, poly.startDate || poly.endDate);

    // 3. Class Alignment & Topic Guard
    const fClass = identifyMarketClass(fMarket, fDesc);
    const pClass = identifyMarketClass(pTitle, pDesc + ' ' + pOutcomes);

    // KEYWORD GUARD: Prevent mixing cards/offsides/goals/etc
    for (const kw of EXCLUDED_KEYWORDS) {
        const inF = (fMarket + ' ' + fDesc + ' ' + fEvent).toLowerCase().includes(kw);
        const inP = (pTitle + ' ' + pDesc).toLowerCase().includes(kw);
        if (inF || inP) {
            // If either side contains a bullshit market keyword, and the other doesn't, kill it
            if (inF && !inP) return 0.0;
            if (!inF && inP && kw !== 'win' && kw !== 'goals') return 0.0;
        }
    }

    let classBonus = 0;
    let classPenalty = 0;

    // League Guard: Prevent cross-league noise
    // League Guard: Prevent cross-league noise
    const leagues_final = Object.values(LEAGUE_NORMALIZATIONS);
    const fLeague_final = leagues_final.find(l => nFliq.includes(l as string));
    const pLeague_final = leagues_final.find(l => nPoly.includes(l as string));
    if (fLeague_final && pLeague_final && fLeague_final !== pLeague_final) {
        classPenalty += 1.0;
    }

    // Topic Guard: CRITICAL for preventing country-name overlaps (e.g. Cricket vs Politics)
    const politicsRegex = new RegExp(`(${POLITICS_KEYWORDS.join('|')})`, 'i');
    const sportsRegex = new RegExp(`(${SPORTS_KEYWORDS.join('|')})`, 'i');

    const isPoliticsOrCrypto = politicsRegex.test(pTitle + ' ' + pDesc);
    const isSports = sportsRegex.test(fEvent + ' ' + fMarket);

    if (isSports && isPoliticsOrCrypto) return 0.0;

    // If Poly is clearly a different topic than the detected Fliq sport, kill it
    if (fSport !== 'UNKNOWN' && isPoliticsOrCrypto) return 0.0;

    if (fClass === 'EXCLUDED' || pClass === 'EXCLUDED') return 0.0;

    if ((fClass as string) !== 'UNKNOWN' && (pClass as string) !== 'UNKNOWN') {
        if (fClass === pClass) {
            classBonus = 0.2; // Match type alignment is a strong signal
        } else {
            // Strictly kill cross-class outcome matches
            // Special Case: GAME class is too vague, don't allow it to match specific markets
            if (fClass !== 'GAME' && pClass === 'GAME' && (fClass as string) !== 'UNKNOWN') return 0.0;
            if (pClass !== 'GAME' && fClass === 'GAME' && (pClass as string) !== 'UNKNOWN') return 0.0;

            if (fClass !== pClass) return 0.0;
        }
    }

    // 4. Pattern-Specific Logic
    let patternScore = 0.1;
    const fLow = (fMarket + ' ' + fDesc).toLowerCase();
    const pLowFinal = (pTitle + ' ' + pDesc + ' ' + pOutcomes).toLowerCase();

    // GOALS Pattern: Handle numeric alignment (e.g. "3 or more" vs "2.5")
    if (fClass === 'GOALS' && pClass === 'GOALS') {
        const goalPatterns = [
            { f: '2 or more', p: '1.5' },
            { f: '3 or more', p: '2.5' },
            { f: '4 or more', p: '3.5' }
        ];
        let found = false;
        goalPatterns.forEach(pat => {
            if (fLow.includes(pat.f) && pLowFinal.includes(pat.p)) {
                patternScore = 1.0;
                found = true;
            }
        });
        // If they are both goals but numbers don't match, kill it
        if (!found && (fLow.includes('more') || pLowFinal.includes('over'))) {
            return 0.0;
        }
    }

    // BTTS Pattern
    if (fClass === 'BTTS' && pClass === 'BTTS') {
        if (fLow.includes('both') && pLowFinal.includes('both')) patternScore = 1.0;
        else if (fLow.includes('btts') && pLowFinal.includes('btts')) patternScore = 1.0;
    }

    // WINNER Pattern
    if (fClass === 'WINNER' || pClass === 'WINNER') {
        if (fLow.includes('win') && pLowFinal.includes('win')) patternScore = 1.0;
        if (fLow.includes('beat') && pLowFinal.includes('win')) patternScore = 1.0;
    }

    const overall = (titleScore * 0.4) + (dateScore * 0.2) + (patternScore * 0.4) + classBonus - classPenalty;
    return Math.max(0, Math.min(1.0, Math.round(overall * 1000) / 1000));
};

export const computeDetailedTrust = (fliq: FliqQuestion, poly: PolyMarket): MatchTrust => {
    const fliqTitle = fliq.blockchainMetadata.parentQuestionHeader || fliq.blockchainMetadata.questionHeader || '';
    const polyTitle = poly.title || poly.question || '';

    const title = teamOverlapScore(fliqTitle, polyTitle);
    const dates = dateProximityScore(fliq.blockchainMetadata.questionEndTime, poly.startDate || poly.endDate);

    // Heuristic criteria matching
    const fStr = (fliqTitle + ' ' + (fliq.category || '')).toLowerCase();
    const pStr = (polyTitle + ' ' + (poly.tags || []).map(t => t.label || '').join(' ')).toLowerCase();

    let criteria = 0.5;
    if (fStr.includes('football') && (pStr.includes('soccer') || pStr.includes('premier league'))) criteria += 0.3;
    if (fStr.includes('nba') && pStr.includes('basketball')) criteria += 0.3;

    return {
        title,
        dates,
        criteria: Math.min(1.0, criteria),
        overall: computeMatchScore(fliq, poly)
    };
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
