import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';
import type { AnalysisResult } from '../types';

const formatEnumLabel = (value: string) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const priorityLabel: Record<string, string> = {
  CORE: 'Critical',
  IMPORTANT: 'Important',
  OPTIONAL: 'Nice to Have',
  CONTEXTUAL: 'Contextual',
};

const getFitScoreMessage = (scorePct: number) => {
  if (scorePct >= 80) {
    return 'Strong readiness for your target role/market. Focus on polishing targeted gaps to improve competitiveness.';
  }
  if (scorePct >= 60) {
    return 'Moderate readiness. You already match part of the market expectation, but important gaps still impact hiring chances.';
  }
  if (scorePct >= 40) {
    return 'Early-to-mid readiness. You need focused upskilling on core requirements before the profile is market-competitive.';
  }
  return 'Low readiness for current target settings. Start with core skills and critical prerequisites to build a viable path.';
};

export default function Dashboard() {
  const { profileId } = useParams<{ profileId: string }>();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [exporting, setExporting] = useState<'pdf' | 'html' | null>(null);
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

  const parseFileName = (contentDisposition: string | undefined, fallback: string) => {
    if (!contentDisposition) return fallback;
    const utf8Match = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
    if (utf8Match?.[1]) {
      return decodeURIComponent(utf8Match[1]);
    }
    const plainMatch = contentDisposition.match(/filename="?([^"]+)"?/i);
    return plainMatch?.[1] ?? fallback;
  };

  const exportReport = async (format: 'pdf' | 'html') => {
    if (!result) return;
    setExporting(format);
    setError('');
    try {
      const response = await client.get(`/reports/analyses/${result.id}/${format}`, {
        responseType: 'blob',
      });
      const fallbackName = `relocation-readiness-${result.id}.${format}`;
      const fileName = parseFileName(response.headers['content-disposition'], fallbackName);
      const href = window.URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = href;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(href);
    } catch {
      setError(`Failed to export ${format.toUpperCase()} report`);
    } finally {
      setExporting(null);
    }
  };

  if (loading) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Loading...</p>;

  const scoreColor = (score: number) =>
    score >= 70 ? '#4caf50' : score >= 40 ? '#ff9800' : '#f44336';
  const fitScorePct = result ? Math.round(result.fitScore * 100) : 0;
  const analysisByCompetency = new Map(
    result?.analysisItems.map((item) => [item.competency.id, item]),
  );
  const groupedContributors = result
    ? result.fitScoreContributors.reduce(
        (acc, contributor) => {
          const item = analysisByCompetency.get(contributor.competencyId);
          const priority = item?.priority ?? 'OPTIONAL';
          if (!acc[priority]) acc[priority] = [];
          acc[priority].push(contributor);
          return acc;
        },
        {} as Record<string, typeof result.fitScoreContributors>,
      )
    : {};
  const groupOrder = ['CORE', 'IMPORTANT', 'OPTIONAL', 'CONTEXTUAL'];

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
                color: scoreColor(fitScorePct),
              }}
            >
              {fitScorePct}%
            </div>
            <p style={{ color: '#444', maxWidth: '760px', margin: '0 auto 0.75rem' }}>
              {getFitScoreMessage(fitScorePct)}
            </p>
            <p style={{ color: '#666' }}>Critical-path estimate: {result.totalPrepMonths} months</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                onClick={() => exportReport('pdf')}
                disabled={exporting !== null}
                style={{
                  padding: '0.55rem 1.1rem',
                  background: '#e94560',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: exporting !== null ? 'not-allowed' : 'pointer',
                }}
              >
                {exporting === 'pdf' ? 'Preparing PDF...' : 'Save as PDF'}
              </button>
              <button
                onClick={() => exportReport('html')}
                disabled={exporting !== null}
                style={{
                  padding: '0.55rem 1.1rem',
                  background: '#1a1a2e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: exporting !== null ? 'not-allowed' : 'pointer',
                }}
              >
                {exporting === 'html' ? 'Preparing HTML...' : 'Save as HTML'}
              </button>
            </div>
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
            <p style={{ marginTop: 0, color: '#666', fontSize: '0.9rem' }}>
              Top bar: your current level. Bottom bar: expected target level for this competency.
            </p>
            {groupOrder.map((group) => {
              const contributors = groupedContributors[group] ?? [];
              if (contributors.length === 0) return null;
              return (
                <div key={group} style={{ marginBottom: '1rem' }}>
                  <div
                    style={{
                      fontWeight: 700,
                      marginBottom: '0.45rem',
                      color: '#1a1a2e',
                    }}
                  >
                    {priorityLabel[group] ?? formatEnumLabel(group)}
                  </div>
                  {contributors.map((c) => {
                    const item = analysisByCompetency.get(c.competencyId);
                    const currentPct = Math.round(
                      (Number(item?.normalizedCurrentScore ?? c.matchScore) || 0) * 100,
                    );
                    const expectedPct = Math.round(
                      (Number(item?.normalizedRequiredScore ?? 1) || 0) * 100,
                    );
                    return (
                      <div
                        key={c.competencyId}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '220px 1fr 80px',
                          gap: '0.5rem',
                          marginBottom: '0.5rem',
                        }}
                      >
                        <span>{c.competencyName}</span>
                        <div
                          style={{
                            background: '#eee',
                            borderRadius: 4,
                            overflow: 'hidden',
                            padding: '4px 4px 3px',
                            display: 'grid',
                            gap: '3px',
                          }}
                        >
                          <div
                            style={{
                              width: `${currentPct}%`,
                              background: scoreColor(currentPct),
                              height: 8,
                              borderRadius: 3,
                            }}
                          />
                          <div
                            style={{
                              width: `${expectedPct}%`,
                              background: 'rgb(26, 26, 46)',
                              height: 8,
                              borderRadius: 3,
                            }}
                          />
                        </div>
                        <span>{currentPct}/{expectedPct}%</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
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
                  {formatEnumLabel(g.priority)} / {formatEnumLabel(g.roleRelevance)} / {formatEnumLabel(g.recommendationType)}
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
                <strong>{g.competency.name}</strong> - {formatEnumLabel(g.recommendationType)}
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
