import type { MatchResult } from './matcher';
import { EXCLUDED_KEYWORDS, POLITICS_KEYWORDS } from './knowledge';

export interface VerificationResult {
    success: boolean;
    confidence: number;
    reasoning: string;
    mismatchType?: 'EVENT' | 'OUTCOME' | 'TIME' | 'SCOPE';
}

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`;

/**
 * Tactical Service for LLM-based verification of cross-platform matchings.
 * Uses Gemini 1.5 Pro to perform deep semantic analysis.
 */
export const verifyMatchSemantic = async (match: MatchResult): Promise<VerificationResult> => {
    if (!GEMINI_API_KEY) {
        console.warn("[AI_VERIFY] No API key found. Falling back to local logic.");
        return fallbackLocalLogic(match);
    }

    const fliq = {
        title: match.fliq.blockchainMetadata.parentQuestionHeader || match.fliq.blockchainMetadata.questionHeader,
        description: match.fliq.blockchainMetadata.questionHeaderExpanded,
        category: match.fliq.category,
        endTime: new Date(parseInt(match.fliq.blockchainMetadata.questionEndTime) * 1000).toISOString()
    };

    const poly = {
        title: match.poly.title || match.poly.question,
        description: match.poly.description,
        outcomes: match.poly.outcomes,
        endTime: match.poly.endDate
    };

    const prompt = `
        You are a specialized Sports Arbitrage Verification Agent. 
        Analyze if these two prediction markets represent the EXACT same event and outcome.
        
        PLATFORM A (Fliq):
        Title: ${fliq.title}
        Description: ${fliq.description}
        Closing Time: ${fliq.endTime}
        
        PLATFORM B (Polymarket):
        Title: ${poly.title}
        Description: ${poly.description}
        Outcomes: ${JSON.stringify(poly.outcomes)}
        Closing Time: ${poly.endTime}
        
        RECOGNITION PATTERNS:
        1. GOALS: 'X or more goals' on Fliq is IDENTICAL to 'Over X-0.5' (e.g. 3 or more == Over 2.5) on Polymarket.
        2. BTTS: 'Both teams to score' or 'BTTS' must match on both sides.
        3. WINNER: 'Team A to win' must match 'Team A' as the winning outcome on Platform B.
        4. SCOPE: Ensure a specific match (A vs B) isn't being compared to a season-long standing or league winner.
        5. TOPIC GUARD: Be extremely strict about country name overlaps. If Fliq is a Cricket match (e.g. Sri Lanka vs Zimbabwe) but Poly is about a Presidential Election or Government status (e.g. Sri Lanka Presidency), mark success as FALSE.
        6. BULLSHIT MARKETS: We do NOT trade secondary markets like 'Cards', 'Corners', 'Passes', or 'Offsides'. If you detect these on either side but not both, mark success as FALSE.
        
        KEYWORDS TO KILL:
        - Politics/Gov: ${POLITICS_KEYWORDS.join(', ')}
        - Excluded: ${EXCLUDED_KEYWORDS.join(', ')}
        
        Return ONLY a JSON object in this format:
        {
            "success": boolean,
            "confidence": number (0.0 to 1.0),
            "reasoning": "Technical explanation of alignment (e.g. 'Confirmed: 3 or more goals maps to Over 2.5')",
            "mismatchType": "EVENT" | "OUTCOME" | "TIME" | "SCOPE" (optional)
        }
    `;

    try {
        const response = await fetch(GEMINI_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }]
            })
        });

        const data = await response.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!text) throw new Error("Empty response from Gemini");

        const result = JSON.parse(text) as VerificationResult;
        console.log(`[AI_VERIFY] Gemini Analysis:`, result);
        return result;

    } catch (error) {
        console.error("[AI_VERIFY] Error calling Gemini:", error);
        return fallbackLocalLogic(match);
    }
};

/**
 * Fallback logic for when API is unavailable or key is missing.
 */
const fallbackLocalLogic = async (match: MatchResult): Promise<VerificationResult> => {
    const fliqTitle = (match.fliq.blockchainMetadata.parentQuestionHeader || match.fliq.blockchainMetadata.questionHeader || '').toLowerCase();
    const polyTitle = (match.poly.title || match.poly.question || '').toLowerCase();

    // Check for match vs seasonal future
    const isSpecificGame = fliqTitle.includes(' vs ') || fliqTitle.includes(' v ');
    const isSeasonal = /(win the|championship|league|finals|cup|la liga|premier league)/i.test(polyTitle);

    if (isSpecificGame && isSeasonal) {
        return {
            success: false,
            confidence: 0.95,
            reasoning: "Local Check: Scope Mismatch. Fliq is a match, Poly is a seasonal standing/win.",
            mismatchType: 'SCOPE'
        };
    }

    // Keyword Guard in fallback
    const isExcluded = EXCLUDED_KEYWORDS.some(kw => polyTitle.includes(kw) || fliqTitle.includes(kw));
    const isPolitics = POLITICS_KEYWORDS.some(kw => polyTitle.includes(kw));

    if (isExcluded && !polyTitle.includes('goal')) {
        return { success: false, confidence: 1.0, reasoning: "Local Check: Excluded market type (cards/corners/etc)", mismatchType: 'OUTCOME' };
    }

    if (isPolitics && !fliqTitle.includes('election')) {
        return { success: false, confidence: 1.0, reasoning: "Local Check: Topic Mismatch (Sports vs Politics)", mismatchType: 'EVENT' };
    }

    return {
        success: match.score > 0.6,
        confidence: match.score,
        reasoning: `Local Check: Confidence derived from title token overlap (${(match.score * 100).toFixed(0)}%).`
    };
};
