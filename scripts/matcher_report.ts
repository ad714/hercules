import fs from 'fs';
import path from 'path';
import { computeMatchScore, computeDetailedTrust, extractTeams } from '../src/services/matcher';

async function runReport() {
    console.log('--- HERCULES MATCHER DIAGNOSTIC REPORT ---');

    const snapshotPath = path.join(process.cwd(), 'markets_snapshot.json');
    if (!fs.existsSync(snapshotPath)) {
        console.error('Snapshot not found. Run sync_markets.ts first.');
        return;
    }

    const data = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
    const fliq = data.fliq_markets;
    const poly = data.poly_markets;

    console.log(`Analyzing ${fliq.length} Fliq vs ${poly.length} Poly markets...`);

    const nearMisses: any[] = [];
    const highMatchDetected: any[] = [];

    let count = 0;
    for (const f of fliq) {
        count++;
        if (count % 10 === 0) console.log(`  Processing ${count}/${fliq.length}...`);
        if (!f.blockchainMetadata) continue;
        const fEventRaw = f.blockchainMetadata.parentQuestionHeader || f.blockchainMetadata.questionHeader || '';
        const [fa, fb] = extractTeams(fEventRaw);

        for (const p of poly) {
            let score = 0;
            try {
                score = computeMatchScore(f, p);
            } catch (e) {
                continue;
            }

            if (score >= 0.1) {
                highMatchDetected.push({ f, p, score });
            } else if (score >= 0.01) {
                const pTitle = p.title || p.question || '';
                const faLow = (fa || '').toLowerCase();
                const fbLow = (fb || '').toLowerCase();
                const pTitleLow = pTitle.toLowerCase();

                // If at least one team name is present in both
                if ((faLow && pTitleLow.includes(faLow)) || (fbLow && pTitleLow.includes(fbLow))) {
                    nearMisses.push({
                        fliq: fEventRaw,
                        poly: pTitle,
                        score,
                        trust: computeDetailedTrust(f, p)
                    });
                }
            }
        }
    }

    console.log('\n[SECTION 0: HIGH MATCHES (Found in loop)]');
    highMatchDetected.sort((a, b) => b.score - a.score).slice(0, 20).forEach(m => {
        const fT = m.f.blockchainMetadata.parentQuestionHeader || m.f.blockchainMetadata.questionHeader;
        const pT = m.p.title || m.p.question;
        console.log(`[${m.score.toFixed(2)}] Fliq: ${fT}`);
        console.log(`       Poly: ${pT}`);
        console.log('---');
    });

    console.log('\n[SECTION 1: NEAR MISSES (Low score but team overlap found)]');
    nearMisses.sort((a, b) => b.score - a.score).slice(0, 50).forEach(m => {
        console.log(`[${m.score.toFixed(2)}] Fliq: ${m.fliq}`);
        console.log(`       Poly: ${m.poly}`);
        console.log(`       Trust: Tit:${m.trust.title.toFixed(2)} Dat:${m.trust.dates.toFixed(2)} Cri:${m.trust.criteria.toFixed(2)}`);
        console.log('---');
    });

    console.log(`\nTotal Matches Found (>= 0.4): ${highMatchDetected.length}`);
    console.log(`Total Near Misses: ${nearMisses.length}`);

    console.log('\n--- END OF REPORT ---');
}

runReport();
