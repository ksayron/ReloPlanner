import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import client from '../api/client';

interface ProfileSummary {
  id: string;
  currentCountry: string;
  targetCountry: string;
  targetCity: string | null;
  desiredRole: string;
  yearsExperience: number;
  createdAt: string;
}

const COUNTRY_NAMES: Record<string, string> = {
  DE: 'Germany', PL: 'Poland', CA: 'Canada', UA: 'Ukraine',
  US: 'United States', GB: 'United Kingdom', NL: 'Netherlands',
  FR: 'France', ES: 'Spain', CZ: 'Czech Republic',
};

export default function Profiles() {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/profiles')
      .then(res => setProfiles(res.data))
      .catch(() => setError('Failed to load profiles'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Loading...</p>;

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h2 style={{ margin: 0 }}>My Profiles</h2>
        <Link to="/wizard" style={{ padding: '0.5rem 1.2rem', background: '#e94560', color: '#fff', borderRadius: '4px', textDecoration: 'none' }}>
          + New Profile
        </Link>
      </div>

      {error && <p style={{ color: '#f44336' }}>{error}</p>}

      {profiles.length === 0 && !error && (
        <div style={{ textAlign: 'center', padding: '3rem', background: '#f9f9f9', borderRadius: '8px' }}>
          <p style={{ marginBottom: '1rem', color: '#666' }}>You haven't created any profiles yet.</p>
          <Link to="/wizard" style={{ padding: '0.6rem 1.5rem', background: '#e94560', color: '#fff', borderRadius: '4px', textDecoration: 'none' }}>
            Create Your First Profile
          </Link>
        </div>
      )}

      {profiles.map(p => (
        <Link
          key={p.id}
          to={`/dashboard/${p.id}`}
          style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '1rem 1.5rem', marginBottom: '0.75rem' }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <strong style={{ fontSize: '1.1rem' }}>{p.desiredRole}</strong>
              <p style={{ margin: '0.25rem 0 0', color: '#666', fontSize: '0.9rem' }}>
                {COUNTRY_NAMES[p.currentCountry] || p.currentCountry} → {COUNTRY_NAMES[p.targetCountry] || p.targetCountry}{p.targetCity ? `, ${p.targetCity}` : ''}
              </p>
            </div>
            <div style={{ textAlign: 'right', color: '#999', fontSize: '0.85rem' }}>
              <div>{p.yearsExperience} yrs exp</div>
              <div>{new Date(p.createdAt).toLocaleDateString()}</div>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
