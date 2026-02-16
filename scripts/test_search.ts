import axios from 'axios';

async function testSearch() {
    const query = "Lecce Internazionale";
    console.log(`Testing Poly Search for: ${query}`);

    try {
        const response = await axios.get('https://gamma-api.polymarket.com/events', {
            params: {
                q: query,
                active: 'true',
                closed: 'false'
            }
        });

        console.log('Results:', JSON.stringify(response.data, null, 2));
    } catch (e) {
        console.error('Search failed', e);
    }
}

testSearch();
