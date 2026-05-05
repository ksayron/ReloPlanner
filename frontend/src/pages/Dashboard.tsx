import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';
import type { AnalysisResult } from '../types';

export default function Dashboard() {
  const { profileId } = useParams<{ profileId: string }>();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    client
      .get(`/profiles/${profileId}/results`)
      .then((res) => {
        setResult(res.data);
        setNoResults(false);
      })
      .catch((err) => {
        if (err.response?.status === 404) setNoResults(true);
        else setError('Failed to load results');
      })
      .finally(() => setLoading(false));
  }, [profileId]);

  const runAnalysis = async () => {
    setAnalyzing(true);
    setError('');
    try {
      const res = await client.post(`/profiles/${profileId}/analyze`);
      setResult(res.data);
      setNoResults(false);
    } catch {
      setError('Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  };

  if (loading) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Loading...</p>;

  const scoreColor = (score: number) =>
    score >= 70 ? '#4caf50' : score >= 40 ? '#ff9800' : '#f44336';

  return (
    <div style={{ maxWidth: '980px', margin: '2rem auto' }}>
      <h2>Analysis Dashboard</h2>
      {error && <p style={{ color: '#f44336' }}>{error}</p>}

      {noResults && !result && (
        <div
          style={{
            textAlign: 'center',
            padding: '2rem',
            background: '#f9f9f9',
            borderRadius: '8px',
          }}
        >
          <p style={{ marginBottom: '1rem' }}>No analysis results yet.</p>
          <button
            onClick={runAnalysis}
            disabled={analyzing}
            style={{
              padding: '0.6rem 2rem',
              background: '#e94560',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
            }}
          >
            {analyzing ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </div>
      )}

      {result && (
        <>
          <div
            style={{
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: '8px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
              textAlign: 'center',
            }}
          >
            <h3 style={{ marginBottom: '0.5rem' }}>Fit Score</h3>
            <div
              style={{
                fontSize: '3rem',
                fontWeight: 'bold',
                color: scoreColor(Math.round(result.fitScore * 100)),
              }}
            >
              {Math.round(result.fitScore * 100)}%
            </div>
            <p style={{ color: '#666' }}>Critical-path estimate: {result.totalPrepMonths} months</p>
            {result.timeEstimate && (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: '0.5rem',
                  marginTop: '1rem',
                }}
              >
                <div>Optimistic: {result.timeEstimate.optimisticHours}h</div>
                <div>Realistic: {result.timeEstimate.realisticHours}h</div>
                <div>Critical Path: {result.timeEstimate.criticalPathHours}h</div>
              </div>
            )}
          </div>

          <div
            style={{
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: '8px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
            }}
          >
            <h3 style={{ marginBottom: '1rem' }}>Fit Score Contributors</h3>
            {result.fitScoreContributors.map((c) => (
              <div
                key={c.competencyId}
                style={{ display: 'grid', gridTemplateColumns: '220px 1fr 80px', gap: '0.5rem', marginBottom: '0.5rem' }}
              >
                <span>{c.competencyName}</span>
                <div style={{ background: '#eee', borderRadius: 4 }}>
                  <div
                    style={{
                      width: `${c.matchScore * 100}%`,
                      background: scoreColor(c.matchScore * 100),
                      height: 14,
                      borderRadius: 4,
                    }}
                  />
                </div>
                <span>{Math.round(c.matchScore * 100)}%</span>
              </div>
            ))}
          </div>

          <div
            style={{
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: '8px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
            }}
          >
            <h3 style={{ marginBottom: '1rem' }}>Actionable Gaps</h3>
            {result.actionableGaps.length === 0 && (
              <p style={{ color: '#999' }}>No actionable gaps identified.</p>
            )}
            {result.actionableGaps.map((g) => (
              <div key={g.competency.id} style={{ padding: '0.6rem 0', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                  <strong>{g.competency.name}</strong>
                  <span>
                    {g.currentLevel} to {g.requiredLevel}
                  </span>
                </div>
                <div style={{ fontSize: '0.85rem', color: '#666' }}>
                  {g.priority} / {g.roleRelevance} / {g.recommendationType}
                </div>
                <div style={{ fontSize: '0.85rem', color: '#444' }}>{g.reason}</div>
              </div>
            ))}
          </div>

          <div
            style={{
              background: '#fff',
              border: '1px solid #eee',
              borderRadius: '8px',
              padding: '1.5rem',
              marginBottom: '1.5rem',
            }}
          >
            <h3 style={{ marginBottom: '1rem' }}>Market Context / Exclusions</h3>
            {result.marketContext.map((g) => (
              <div key={g.competency.id} style={{ padding: '0.45rem 0', borderBottom: '1px solid #f6f6f6' }}>
                <strong>{g.competency.name}</strong> - {g.recommendationType}
                <div style={{ fontSize: '0.82rem', color: '#555' }}>{g.reason}</div>
              </div>
            ))}
          </div>

          <Link
            to={`/progress/${profileId}`}
            style={{
              display: 'inline-block',
              padding: '0.6rem 1.5rem',
              background: '#e94560',
              color: '#fff',
              borderRadius: '4px',
              textDecoration: 'none',
            }}
          >
            View Progress Tracker
          </Link>
        </>
      )}
    </div>
  );
}
