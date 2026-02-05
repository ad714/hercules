import fs from 'fs';

interface FliqMarket {
    questionId: string;
    blockchainMetadata: {
        parentQuestionHeader: string;
        category: string;
    };
}

interface PolyMarket {
    id: string;
    title: string;
}

function normalize(s: string) {
    if (!s) return '';
    return s.toLowerCase().replace(/[^a-z0-9]/g, ' ');
}

async function match() {
    const data = JSON.parse(fs.readFileSync('markets_snapshot.json', 'utf8'));
    const fliq: FliqMarket[] = data.fliq_markets;
    const poly: PolyMarket[] = data.poly_markets;

    console.log(`Analyzing ${fliq.length} Fliq and ${poly.length} Poly markets...`);

    const results: any[] = [];

    for (const f of fliq) {
        if (f.blockchainMetadata?.category !== 'football') continue;

        const ft = normalize(f.blockchainMetadata.parentQuestionHeader);

        for (const p of poly) {
            const pt = normalize(p.title);

            // Look for team name overlaps
            const fWords = ft.split(' ').filter(w => w.length > 3);
            const pWords = pt.split(' ').filter(w => w.length > 3);

            const overlap = fWords.filter(w => pWords.includes(w));

            if (overlap.length >= 2) {
                results.push({
                    fliq: f.blockchainMetadata.parentQuestionHeader,
                    poly: p.title,
                    overlap
                });
            }
        }
    }

    console.log('Matches found:', results.length);
    results.slice(0, 20).forEach(r => {
        console.log(`MATCH: [FLIQ] ${r.fliq} <==> [POLY] ${r.poly}`);
    });
}

match();
