
import { computeMatchScore, extractTeams, computeDetailedTrust } from './src/services/matcher';

const fliqMarket = {
    questionId: "mac-fix-test",
    blockchainMetadata: {
        parentQuestionHeader: "Macclesfield vs Brentford, 16th Feb, FA cup",
        questionHeader: "3 or more goals",
        questionEndTime: "1739754000", // ~6 hours from now
    }
};

const polyMarket = {
    title: "Over 2.5 Goals",
    description: "Macclesfield FC vs Brentford FC. This market will resolve to Yes if there are 3 or more goals scored in the match between Macclesfield and Brentford.",
    startDate: "2026-02-17T01:00:00Z",
    outcomes: ["Yes", "No"],
    outcomePrices: ["0.5", "0.5"],
    tokens: [{ token_id: "test-token" }]
};

console.log("--- MATCH TEST ---");
const score = computeMatchScore(fliqMarket as any, polyMarket as any);
console.log("Score:", score);
console.log("Teams Extracted:", extractTeams(fliqMarket.blockchainMetadata.parentQuestionHeader));
console.log("Trust:", computeDetailedTrust(fliqMarket as any, polyMarket as any));
