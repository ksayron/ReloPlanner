import { useState, useEffect } from 'react';
import client from '../../api/client';
import { fetchCountriesCatalog } from '../../api/countries';

interface SyncResult {
  country: string;
  status: 'synced' | 'skipped' | 'error';
  totalVacancies?: number;
  skillsImported?: number;
  message?: string;
}

interface SnapshotInfo {
  date: string | null;
  source: string | null;
  skills: number;
  status?: 'synced' | 'skipped' | 'error' | 'unknown';
  totalVacancies?: number | null;
  skillsImported?: number | null;
  message?: string | null;
  updatedAt?: string | null;
}

interface CacheStatus {
  lastRefreshed: string | null;
  ageMinutes: number | null;
  staleThresholdMinutes: number;
  isStale: boolean;
  endpoints: Record<string, boolean>;
}

interface ColSkippedItem {
  countryIso: string;
  city: string;
  reason: string;
}

const STATUS_COLORS: Record<SyncResult['status'], string> = {
  synced: '#4caf50',
  skipped: '#ff9800',
  error: '#f44336',
};

export default function SyncManager() {
  const [marketStatus, setMarketStatus] = useState<Record<string, SnapshotInfo | null>>({});
  const [cacheStatus, setCacheStatus] = useState<CacheStatus | null>(null);
  const [syncResults, setSyncResults] = useState<SyncResult[]>([]);
  const [syncingAll, setSyncingAll] = useState(false);
  const [syncingCountry, setSyncingCountry] = useState<string | null>(null);
  const [colSyncing, setColSyncing] = useState(false);
  const [colResult, setColResult] = useState<{ updated: string[]; skipped: ColSkippedItem[] } | null>(null);
  const [error, setError] = useState('');
  const [countries, setCountries] = useState<string[]>([]);

  useEffect(() => {
    loadStatus();
    void loadCountries();
  }, []);

  const loadCountries = async () => {
    const catalog = await fetchCountriesCatalog();
    setCountries(catalog.target.map((country) => country.code));
  };

  const loadStatus = async () => {
    try {
      const [marketRes, cacheRes] = await Promise.all([
        client.get('/admin/sync/market/status'),
        client.get('/cost-of-living/cache-status'),
      ]);
      setMarketStatus(marketRes.data);
      setCacheStatus(cacheRes.data);
    } catch {
      setError('Failed to load sync status');
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    setSyncResults([]);
    setError('');
    try {
      const res = await client.post('/admin/sync/market');
      setSyncResults(res.data);
      await loadStatus();
    } catch {
      setError('Market sync failed');
    } finally {
      setSyncingAll(false);
    }
  };

  const handleSyncCountry = async (country: string) => {
    setSyncingCountry(country);
    setError('');
    try {
      const res = await client.post(`/admin/sync/market/${country}`);
      setSyncResults([res.data]);
      await loadStatus();
    } catch {
      setError(`Sync failed for ${country}`);
    } finally {
      setSyncingCountry(null);
    }
  };

  const handleColSync = async () => {
    setColSyncing(true);
    setColResult(null);
    setError('');
    try {
      const res = await client.post('/cost-of-living/sync');
      setColResult(res.data);
      await loadStatus();
    } catch {
      setError('CoL sync failed');
    } finally {
      setColSyncing(false);
    }
  };

  const sectionStyle = { background: '#fff', borderRadius: '8px', padding: '1.5rem', marginBottom: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } as const;
  const btnStyle = { padding: '0.5rem 1.2rem', background: '#e94560', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' } as const;
  const smallBtnStyle = { ...btnStyle, padding: '0.3rem 0.8rem', fontSize: '0.8rem' } as const;

  return (
    <div style={{ maxWidth: '900px', margin: '2rem auto' }}>
      <h2>Data Sync Manager</h2>
      {error && <p style={{ color: '#f44336', marginBottom: '1rem' }}>{error}</p>}

      {/* Market sync */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Job Market Snapshots</h3>
          <button onClick={handleSyncAll} disabled={syncingAll} style={btnStyle}>
            {syncingAll ? 'Syncing...' : 'Sync All Countries'}
          </button>
        </div>
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
          DE, NL, CA, GB, PL via Adzuna API &nbsp;|&nbsp; Runs daily at 02:00 UTC
        </p>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f5f5f5' }}>
              <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Country</th>
              <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Last Snapshot</th>
              <th style={{ padding: '0.5rem', textAlign: 'right', borderBottom: '1px solid #ddd' }}>Skills</th>
              <th style={{ padding: '0.5rem', textAlign: 'left', borderBottom: '1px solid #ddd' }}>Source</th>
              <th style={{ padding: '0.5rem', borderBottom: '1px solid #ddd' }}></th>
            </tr>
          </thead>
          <tbody>
            {countries.map((country) => {
              const info = marketStatus[country];
              return (
                <tr key={country}>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', fontWeight: 'bold' }}>{country}</td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', color: info?.date ? '#333' : '#999' }}>
                    {info?.date ? new Date(info.date).toLocaleDateString() : 'No data'}
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', textAlign: 'right' }}>
                    {info?.skills ?? 'N/A'}
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', color: '#666', fontSize: '0.85rem' }}>
                    {info?.source ?? 'N/A'}
                    {info?.status ? ` (${info.status})` : ''}
                  </td>
                  <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', textAlign: 'right' }}>
                    <button
                      onClick={() => handleSyncCountry(country)}
                      disabled={syncingCountry === country || syncingAll}
                      style={smallBtnStyle}
                    >
                      {syncingCountry === country ? '...' : 'Sync'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {syncResults.length > 0 && (
          <div style={{ marginTop: '1rem' }}>
            <strong>Last sync results:</strong>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
              {syncResults.map((r) => (
                <span
                  key={r.country}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    background: STATUS_COLORS[r.status] + '22',
                    color: STATUS_COLORS[r.status],
                    border: `1px solid ${STATUS_COLORS[r.status]}44`,
                    fontSize: '0.82rem',
                  }}
                >
                  {r.country}: {r.status}
                  {r.skillsImported != null && ` (${r.skillsImported} skills)`}
                  {r.message && ` - ${r.message}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* CoL sync */}
      <div style={sectionStyle}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ margin: 0 }}>Cost of Living Data</h3>
          <button onClick={handleColSync} disabled={colSyncing} style={btnStyle}>
            {colSyncing ? 'Syncing...' : 'Sync from WhereNext'}
          </button>
        </div>
        <p style={{ color: '#666', fontSize: '0.85rem', marginBottom: '1rem' }}>
          Source: getwherenext.com &nbsp;|&nbsp; Cities: Berlin, Amsterdam, London, Warsaw, Toronto &nbsp;|&nbsp; Cache refreshes hourly
        </p>

        {cacheStatus && (
          <div style={{ marginBottom: '1rem' }}>
            <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '0.5rem' }}>
              Cache last refreshed:{' '}
              {cacheStatus.lastRefreshed
                ? new Date(cacheStatus.lastRefreshed).toLocaleString()
                : 'Not yet loaded'}
            </div>
            <div style={{ color: cacheStatus.isStale ? '#f44336' : '#4caf50', fontSize: '0.82rem', marginBottom: '0.5rem' }}>
              Cache status: {cacheStatus.isStale ? 'STALE' : 'FRESH'}
              {cacheStatus.ageMinutes != null && ` (${cacheStatus.ageMinutes} min old)`}
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {Object.entries(cacheStatus.endpoints).map(([key, loaded]) => (
                <span
                  key={key}
                  style={{
                    padding: '3px 8px',
                    borderRadius: '4px',
                    background: loaded ? '#4caf5022' : '#f4433622',
                    color: loaded ? '#4caf50' : '#f44336',
                    border: `1px solid ${loaded ? '#4caf5044' : '#f4433644'}`,
                    fontSize: '0.78rem',
                  }}
                >
                  {key}: {loaded ? 'OK' : 'missing'}
                </span>
              ))}
            </div>
          </div>
        )}

        {colResult && (
          <div style={{ marginTop: '0.5rem', fontSize: '0.85rem' }}>
            <span style={{ color: '#4caf50' }}>Updated: {colResult.updated.join(', ') || 'none'}</span>
            {colResult.skipped.length > 0 && (
              <div style={{ color: '#ff9800', marginTop: '0.4rem' }}>
                Skipped:
                {colResult.skipped.map((item) => (
                  <div key={`${item.countryIso}-${item.city}`}>
                    {item.city} ({item.countryIso}) - {item.reason}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

