import { Link } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';

export default function Landing() {
  const { user } = useAuth();

  return (
    <div style={{ textAlign: 'center', paddingTop: '4rem' }}>
      <h1 style={{ fontSize: '2.5rem', marginBottom: '1rem' }}>ReloPlanner</h1>
      <p style={{ fontSize: '1.2rem', color: '#666', maxWidth: '600px', margin: '0 auto 2rem' }}>
        Plan your international relocation with data-driven IT job market analysis.
        Get a personalized preparation roadmap based on your skills and target market.
      </p>
      {user ? (
        <Link to="/wizard" style={{ display: 'inline-block', padding: '0.8rem 2rem', background: '#e94560', color: '#fff', borderRadius: '8px', textDecoration: 'none', fontSize: '1.1rem' }}>
          Create Profile
        </Link>
      ) : (
        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center' }}>
          <Link to="/register" style={{ display: 'inline-block', padding: '0.8rem 2rem', background: '#e94560', color: '#fff', borderRadius: '8px', textDecoration: 'none' }}>Get Started</Link>
          <Link to="/login" style={{ display: 'inline-block', padding: '0.8rem 2rem', background: '#fff', color: '#e94560', borderRadius: '8px', textDecoration: 'none', border: '2px solid #e94560' }}>Login</Link>
        </div>
      )}
    </div>
  );
}
