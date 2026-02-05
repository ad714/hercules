import { useState, useEffect } from 'react';
import { fetchFliqQuestions, filterFliqMatches, type FliqQuestion } from './services/fliq';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [markets, setMarkets] = useState<FliqQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadMarkets = async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchFliqQuestions(1000);
      const filtered = filterFliqMatches(raw);
      setMarkets(filtered);
    } catch (e: any) {
      setError(e.message || 'Failed to fetch markets');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMarkets();
  }, []);

  const formatTimeLeft = (endTs: number) => {
    const now = Date.now() / 1000;
    const diff = endTs - now;
    if (diff <= 0) return 'Ended';

    const mins = Math.floor(diff / 60);
    const hours = Math.floor(diff / 3600);
    const days = Math.floor(diff / 86400);

    if (days >= 30) {
      const months = Math.floor(days / 30);
      const remainingDays = days % 30;
      return `${months}mo ${remainingDays}d`;
    }
    if (days >= 1) {
      const remainingHours = hours % 24;
      return `${days}d ${remainingHours}h`;
    }
    if (hours >= 1) {
      const remainingMins = mins % 60;
      return `${hours}h ${remainingMins}m`;
    }
    return `${mins}m`;
  };


  const buildFliqLink = (market: FliqQuestion) => {
    const bm = market.blockchainMetadata;
    const isMultiQuestion = !!bm.parentQuestionId;

    // For multi-questions, use parentQuestionHeader and parentQuestionId
    // For single questions, use questionHeader and questionId
    const header = isMultiQuestion
      ? (bm.parentQuestionHeader || bm.questionHeader || '')
      : (bm.questionHeader || '');

    const slug = header
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const id = isMultiQuestion ? bm.parentQuestionId : market.questionId;
    const pathType = isMultiQuestion ? 'multi-question' : 'question';

    return `https://fliq.one/${pathType}/${slug}-${id}`;
  };


  return (
    <div style={{
      minHeight: '100vh',
      background: '#0a0a0f',
      color: '#fff',
      fontFamily: 'system-ui, sans-serif',
      padding: '2rem'
    }}>
      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '0.5rem' }}>
          Fliq Live Markets
        </h1>
        <p style={{ color: '#888' }}>
          {loading ? 'Loading...' : `${markets.length} live markets`}
        </p>
        <button
          onClick={loadMarkets}
          disabled={loading}
          style={{
            marginTop: '1rem',
            padding: '0.75rem 1.5rem',
            background: loading ? '#333' : '#00d4ff',
            color: loading ? '#888' : '#000',
            border: 'none',
            borderRadius: '8px',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontWeight: 'bold'
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </header>

      {error && (
        <div style={{
          padding: '1rem',
          background: '#ff4444',
          borderRadius: '8px',
          marginBottom: '1rem'
        }}>
          Error: {error}
        </div>
      )}

      <div style={{ overflowX: 'auto' }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.85rem'
        }}>
          <thead>
            <tr style={{
              background: '#12121a',
              borderBottom: '1px solid #222'
            }}>
              <th style={{ padding: '1rem', textAlign: 'left', color: '#888' }}>ID</th>
              <th style={{ padding: '1rem', textAlign: 'left', color: '#888' }}>Market</th>
              <th style={{ padding: '1rem', textAlign: 'left', color: '#888' }}>Category</th>
              <th style={{ padding: '1rem', textAlign: 'left', color: '#888' }}>Time Left</th>
              <th style={{ padding: '1rem', textAlign: 'left', color: '#888' }}>End Date</th>
              <th style={{ padding: '1rem', textAlign: 'left', color: '#888' }}>Polymarket Match</th>
            </tr>
          </thead>
          <tbody>
            {markets.map((market) => {
              const bm = market.blockchainMetadata;
              const endTs = parseInt(bm.questionEndTime || '0');
              const title = bm.parentQuestionHeader || bm.questionHeader || market.questionId;
              const link = buildFliqLink(market);

              return (
                <tr
                  key={market.questionId}
                  style={{
                    borderBottom: '1px solid #1a1a2a',
                    transition: 'background 0.2s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#15151f'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '0.75rem 1rem', color: '#555', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {market.questionId}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <a
                      href={link}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{
                        color: '#fff',
                        textDecoration: 'none',
                        fontWeight: '500'
                      }}
                      onMouseOver={(e) => e.currentTarget.style.color = '#00d4ff'}
                      onMouseOut={(e) => e.currentTarget.style.color = '#fff'}
                    >
                      {title}
                    </a>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      padding: '0.25rem 0.5rem',
                      background: '#1a1a2a',
                      borderRadius: '4px',
                      color: '#888',
                      fontSize: '0.75rem'
                    }}>
                      {bm.category || 'Unknown'}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      color: '#00d4ff',
                      fontWeight: 'bold'
                    }}>
                      {formatTimeLeft(endTs)}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#555', fontSize: '0.75rem' }}>
                    {new Date(endTs * 1000).toLocaleString()}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', color: '#555' }}>
                    <span style={{ color: '#666', fontStyle: 'italic' }}>—</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!loading && markets.length === 0 && !error && (
        <div style={{
          textAlign: 'center',
          padding: '4rem',
          color: '#666'
        }}>
          No live markets found.
        </div>
      )}
    </div>
  );
}
