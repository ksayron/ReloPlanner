import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import client from '../api/client';
import type { AnalysisResult, Skill } from '../types';

export default function Dashboard() {
  const { profileId } = useParams<{ profileId: string }>();
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [skillMap, setSkillMap] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [noResults, setNoResults] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/skills').then(res => {
      const map = new Map<string, string>();
      (res.data as Skill[]).forEach(s => map.set(s.id, s.name));
      setSkillMap(map);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    client.get(`/profiles/${profileId}/results`)
      .then(res => { setResult(res.data); setNoResults(false); })
      .catch(err => {
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

  const scoreColor = (score: number) => score >= 70 ? '#4caf50' : score >= 40 ? '#ff9800' : '#f44336';

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <h2>Analysis Dashboard</h2>
      {error && <p style={{ color: '#f44336' }}>{error}</p>}

      {noResults && !result && (
        <div style={{ textAlign: 'center', padding: '2rem', background: '#f9f9f9', borderRadius: '8px' }}>
          <p style={{ marginBottom: '1rem' }}>No analysis results yet.</p>
          <button onClick={runAnalysis} disabled={analyzing} style={{ padding: '0.6rem 2rem', background: '#e94560', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
            {analyzing ? 'Analyzing...' : 'Run Analysis'}
          </button>
        </div>
      )}

      {result && (
        <>
          {/* Fit Score Card */}
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem', textAlign: 'center' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>Fit Score</h3>
            <div style={{ fontSize: '3rem', fontWeight: 'bold', color: scoreColor(Math.round(result.fitScore * 100)) }}>
              {Math.round(result.fitScore * 100)}%
            </div>
            <p style={{ color: '#666' }}>Estimated preparation: {result.totalPrepMonths} months</p>
          </div>

          {/* Skill Breakdown */}
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Skill Breakdown</h3>
            {result.skillBreakdown.map(sb => (
              <div key={sb.skillId} style={{ display: 'flex', alignItems: 'center', marginBottom: '0.5rem' }}>
                <span style={{ width: '150px', fontSize: '0.9rem' }}>{skillMap.get(sb.skillId) ?? sb.skillId}</span>
                <div style={{ flex: 1, background: '#eee', borderRadius: '4px', height: '16px', marginRight: '0.5rem' }}>
                  <div style={{ width: `${sb.matchScore * 100}%`, background: scoreColor(sb.matchScore * 100), height: '100%', borderRadius: '4px' }} />
                </div>
                <span style={{ fontSize: '0.8rem', color: '#666', width: '60px' }}>{Math.round(sb.matchScore * 100)}%</span>
                <span style={{ fontSize: '0.75rem', color: '#999', width: '80px' }}>({sb.source})</span>
              </div>
            ))}
          </div>

          {/* Gap List */}
          <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Skill Gaps</h3>
            {result.gaps.length === 0 && <p style={{ color: '#999' }}>No gaps identified.</p>}
            {result.gaps.map(gap => {
              const severityColor = gap.severity === 'CRITICAL' ? '#f44336' : gap.severity === 'MODERATE' ? '#ff9800' : '#4caf50';
              return (
                <div key={gap.id} style={{ display: 'flex', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #f0f0f0' }}>
                  <span style={{ flex: 1 }}>{skillMap.get(gap.skillId) ?? gap.skillId}</span>
                  <span style={{ background: severityColor, color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '0.75rem', marginRight: '0.5rem' }}>{gap.severity}</span>
                  <span style={{ fontSize: '0.85rem', color: '#666', width: '100px' }}>{gap.currentLevel} → {gap.requiredLevel}</span>
                  <span style={{ fontSize: '0.85rem', color: '#666', width: '80px' }}>{gap.estimatedMonths}mo</span>
                  <span style={{ fontSize: '0.75rem', color: '#999', width: '90px' }}>{gap.status}</span>
                </div>
              );
            })}
          </div>

          <Link to={`/progress/${profileId}`} style={{ display: 'inline-block', padding: '0.6rem 1.5rem', background: '#e94560', color: '#fff', borderRadius: '4px', textDecoration: 'none' }}>
            View Progress Tracker
          </Link>
        </>
      )}
    </div>
  );
}
