import { useEffect, useState } from 'react';
import client from '../api/client';
import type { CostComparison } from '../types';

export default function CostOfLiving() {
  const [cities, setCities] = useState<string[]>([]);
  const [city1, setCity1] = useState('');
  const [city2, setCity2] = useState('');
  const [result, setResult] = useState<CostComparison | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingCities, setLoadingCities] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadCities = async () => {
      setLoadingCities(true);
      try {
        const res = await client.get('/cost-of-living/cities');
        const cityList = Array.isArray(res.data) ? res.data : [];
        setCities(cityList);
        if (!cityList.includes(city1)) setCity1('');
        if (!cityList.includes(city2)) setCity2('');
      } catch {
        setCities([]);
        setError('Failed to load city options');
      } finally {
        setLoadingCities(false);
      }
    };

    loadCities();
  }, []);

  const handleCompare = async () => {
    if (!city1 || !city2) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const res = await client.get('/cost-of-living/compare', { params: { city1, city2 } });
      setResult(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to fetch comparison data');
    } finally {
      setLoading(false);
    }
  };

  const selectStyle = { padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc', width: '200px', background: '#fff' } as const;

  return (
    <div style={{ maxWidth: '700px', margin: '2rem auto' }}>
      <h2>Cost of Living Comparison</h2>

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>City 1</label>
          <select value={city1} onChange={e => setCity1(e.target.value)} style={selectStyle} disabled={loadingCities || cities.length === 0}>
            <option value="">-- Select city --</option>
            {cities.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>City 2</label>
          <select value={city2} onChange={e => setCity2(e.target.value)} style={selectStyle} disabled={loadingCities || cities.length === 0}>
            <option value="">-- Select city --</option>
            {cities.filter(c => c !== city1).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <button
          onClick={handleCompare}
          disabled={loading || loadingCities || cities.length === 0 || !city1 || !city2}
          style={{ padding: '0.5rem 1.5rem', background: '#e94560', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', height: '38px' }}
        >
          {loading ? 'Loading...' : 'Compare'}
        </button>
      </div>

      {!loadingCities && cities.length === 0 && (
        <p style={{ color: '#666' }}>
          No cost-of-living city data is synced yet. Ask an admin to run data sync in Admin - Sync.
        </p>
      )}

      {error && <p style={{ color: '#f44336' }}>{error}</p>}

      {result && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Category</th>
              <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #ddd' }}>{result.city1} (USD)</th>
              <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #ddd' }}>{result.city2} (USD)</th>
              <th style={{ padding: '0.6rem', textAlign: 'right', borderBottom: '2px solid #ddd' }}>Diff</th>
            </tr>
          </thead>
          <tbody>
            {result.comparison.map(row => {
              const diff = row.city1Amount != null && row.city2Amount != null
                ? row.city1Amount - row.city2Amount : null;
              return (
                <tr key={row.category}>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{row.category}</td>
                  <td style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #eee' }}>
                    {row.city1Amount != null ? `$${Number(row.city1Amount).toFixed(0)}` : 'N/A'}
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #eee' }}>
                    {row.city2Amount != null ? `$${Number(row.city2Amount).toFixed(0)}` : 'N/A'}
                  </td>
                  <td style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #eee', color: diff && diff > 0 ? '#f44336' : '#4caf50' }}>
                    {diff != null ? `${diff > 0 ? '+' : ''}$${diff.toFixed(0)}` : 'N/A'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
