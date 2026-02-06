import { useState, useEffect, useMemo } from 'react';
import { fetchFliqQuestions, filterFliqMatches, type FliqQuestion } from './services/fliq';

export default function App() {
  const [loading, setLoading] = useState(true);
  const [markets, setMarkets] = useState<FliqQuestion[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadMarkets = async () => {
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchFliqQuestions(2000);
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

  const filteredBySearch = useMemo(() => {
    return markets.filter(m => {
      const bm = m.blockchainMetadata;
      const content = `${bm.parentQuestionHeader} ${bm.questionHeader} ${m.questionId} ${bm.category}`.toLowerCase();
      return content.includes(searchQuery.toLowerCase());
    });
  }, [markets, searchQuery]);

  const formatTimeLeft = (endTs: number) => {
    const now = Date.now() / 1000;
    const diff = endTs - now;
    if (diff <= 0) return 'Ended';

    const mins = Math.floor(diff / 60);
    const hours = Math.floor(diff / 3600);
    const days = Math.floor(diff / 86400);

    if (days >= 30) {
      const months = Math.floor(days / 30);
      return `${months}mo ${days % 30}d`;
    }
    if (days >= 1) return `${days}d ${hours % 24}h`;
    if (hours >= 1) return `${hours}h ${mins % 60}m`;
    return `${mins}m`;
  };

  const buildFliqLink = (market: FliqQuestion) => {
    const bm = market.blockchainMetadata;
    const isMultiQuestion = !!bm.parentQuestionId;
    const header = isMultiQuestion ? (bm.parentQuestionHeader || bm.questionHeader) : bm.questionHeader;
    const slug = header?.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'question';
    const id = isMultiQuestion ? bm.parentQuestionId : market.questionId;
    const path = isMultiQuestion ? 'multi-question' : 'question';
    return `https://fliq.one/${path}/${slug}-${id}`;
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: '#040408',
      color: '#e2e2e2',
      fontFamily: '"Inter", system-ui, sans-serif',
      padding: '1.5rem'
    }}>
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem',
        flexWrap: 'wrap',
        gap: '1rem'
      }}>
        <div>
          <h1 style={{
            fontSize: '1.75rem',
            fontWeight: 800,
            background: 'linear-gradient(to right, #00d4ff, #0055ff)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            margin: 0
          }}>
            HERCULES <span style={{ color: '#444', fontSize: '0.8rem', fontWeight: 400, marginLeft: '0.5rem' }}>Dashboard / Fliq Mirror</span>
          </h1>
          <p style={{ color: '#666', marginTop: '0.25rem', fontSize: '0.9rem' }}>
            {loading ? 'Scanning API...' : `${markets.length} live markets available (VPN-free)`}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <input
            type="text"
            placeholder="Search markets, assets, or IDs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '0.6rem 1rem',
              background: '#0a0a14',
              border: '1px solid #222',
              borderRadius: '8px',
              color: '#fff',
              width: '280px',
              outline: 'none',
              transition: 'border-color 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#00d4ff'}
            onBlur={(e) => e.target.style.borderColor = '#222'}
          />
          <button
            onClick={loadMarkets}
            disabled={loading}
            style={{
              padding: '0.6rem 1.25rem',
              background: loading ? '#222' : 'rgba(0, 212, 255, 0.1)',
              color: loading ? '#555' : '#00d4ff',
              border: '1px solid rgba(0, 212, 255, 0.2)',
              borderRadius: '8px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            {loading ? 'Syncing...' : '↻ Refresh'}
          </button>
        </div>
      </header>

      {error && (
        <div style={{ padding: '1rem', background: '#3a0a0a', border: '1px solid #5a0a0a', color: '#ff8888', borderRadius: '8px', marginBottom: '1.5rem' }}>
          API Error: {error}
        </div>
      )}

      <div style={{
        background: '#0a0a14',
        borderRadius: '12px',
        border: '1px solid #1a1a2a',
        overflow: 'hidden'
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '0.88rem'
        }}>
          <thead>
            <tr style={{ background: '#121220', borderBottom: '1px solid #1a1a2a' }}>
              <th style={{ padding: '1rem', textAlign: 'left', color: '#555', fontWeight: 600, width: '50px' }}>ID</th>
              <th style={{ padding: '1rem', textAlign: 'left', color: '#555', fontWeight: 600 }}>Market</th>
              <th style={{ padding: '1rem', textAlign: 'left', color: '#555', fontWeight: 600 }}>Category</th>
              <th style={{ padding: '1rem', textAlign: 'left', color: '#555', fontWeight: 600 }}>Closing In</th>
              <th style={{ padding: '1rem', textAlign: 'left', color: '#555', fontWeight: 600 }}>End Date</th>
              <th style={{ padding: '1rem', textAlign: 'left', color: '#555', fontWeight: 600 }}>Counterpart</th>
            </tr>
          </thead>
          <tbody>
            {filteredBySearch.map((market) => {
              const bm = market.blockchainMetadata;
              const endTs = parseInt(bm.questionEndTime || '0');
              const title = bm.parentQuestionHeader || bm.questionHeader || 'Unnamed Market';
              const link = buildFliqLink(market);

              return (
                <tr
                  key={market.questionId}
                  style={{
                    borderBottom: '1px solid #121220',
                    transition: 'background 0.1s'
                  }}
                  onMouseOver={(e) => e.currentTarget.style.background = '#11111f'}
                  onMouseOut={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '1rem', color: '#333', fontFamily: 'monospace', fontSize: '0.75rem' }}>
                    {market.questionId}
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                      {bm.imgUrl && (
                        <img
                          src={bm.imgUrl}
                          alt="ico"
                          style={{ width: '32px', height: '32px', borderRadius: '6px', objectFit: 'cover', border: '1px solid #222' }}
                        />
                      )}
                      <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                          color: '#fff',
                          textDecoration: 'none',
                          fontWeight: 500,
                          lineHeight: '1.4'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.color = '#00d4ff'}
                        onMouseOut={(e) => e.currentTarget.style.color = '#fff'}
                      >
                        {title}
                      </a>
                    </div>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      padding: '0.2rem 0.6rem',
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      borderRadius: '100px',
                      color: '#888',
                      fontSize: '0.75rem',
                      textTransform: 'capitalize'
                    }}>
                      {bm.category || 'misc'}
                    </span>
                  </td>
                  <td style={{ padding: '1rem' }}>
                    <span style={{
                      color: '#00d4ff',
                      fontWeight: 700,
                      fontVariantNumeric: 'tabular-nums'
                    }}>
                      {formatTimeLeft(endTs)}
                    </span>
                  </td>
                  <td style={{ padding: '1rem', color: '#555', fontSize: '0.75rem' }}>
                    {new Date(endTs * 1000).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </td>
                  <td style={{ padding: '1rem', color: '#444' }}>
                    <span style={{ fontSize: '0.75rem', border: '1px dashed #222', padding: '0.2rem 0.5rem', borderRadius: '4px' }}>
                      Scan Polymarket...
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {!loading && filteredBySearch.length === 0 && (
          <div style={{ textAlign: 'center', padding: '5rem', color: '#444' }}>
            {searchQuery ? `No markets matching "${searchQuery}"` : 'No live markets found'}
          </div>
        )}
      </div>
    </div>
  );
}
