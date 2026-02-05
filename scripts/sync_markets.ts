import axios from 'axios';
import fs from 'fs';
import path from 'path';

const FLIQ_API = 'https://auto-question.fliq.one/question';
const POLY_API = 'https://gamma-api.polymarket.com/markets';

async function fetchAllFliq() {
    console.log('Fetching Fliq markets...');
    let allQuestions: any[] = [];
    let page = 1;
    let hasNext = true;

    while (hasNext && page <= 10) { // Limit to 10 pages for now to avoid ban
        try {
            const resp = await axios.get(FLIQ_API, {
                params: {
                    limit: 100,
                    page: page,
                    select: 'questionId,isSettled,blockchainMetadata'
                }
            });
            const questions = resp.data.questions || [];
            if (questions.length === 0) break;

            const now = Math.floor(Date.now() / 1000);
            const live = questions.filter((q: any) =>
                !q.isSettled &&
                q.blockchainMetadata?.questionEndTime &&
                parseInt(q.blockchainMetadata.questionEndTime) > now
            );

            allQuestions = [...allQuestions, ...live];
            hasNext = resp.data.hasMore || (questions.length === 100);
            page++;
            console.log(`Fliq Page ${page - 1}: Found ${live.length} live markets`);
        } catch (e) {
            console.error('Fliq fetch error', e);
            break;
        }
    }
    return allQuestions;
}

async function fetchAllPoly() {
    console.log('Fetching Poly markets...');
    let allMarkets: any[] = [];
    let offset = 0;
    let hasNext = true;

    while (hasNext && offset < 500) {
        try {
            const resp = await axios.get(POLY_API, {
                params: {
                    active: 'true',
                    closed: 'false',
                    limit: 100,
                    offset: offset
                }
            });
            const markets = resp.data || [];
            if (markets.length === 0) break;

            allMarkets = [...allMarkets, ...markets];
            hasNext = markets.length === 100;
            offset += 100;
            console.log(`Poly Offset ${offset}: Total ${allMarkets.length}`);
        } catch (e) {
            console.error('Poly fetch error', e);
            break;
        }
    }
    return allMarkets;
}

async function run() {
    const fliq = await fetchAllFliq();
    const poly = await fetchAllPoly();

    const data = {
        timestamp: new Date().toISOString(),
        fliq_count: fliq.length,
        poly_count: poly.length,
        fliq_markets: fliq,
        poly_markets: poly
    };

    const filePath = path.join(process.cwd(), 'markets_snapshot.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log(`Saved ${fliq.length} Fliq and ${poly.length} Poly markets to ${filePath}`);
}

run();
