import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login, loading } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await login(email, password);
      navigate('/wizard');
    } catch {
      setError('Invalid credentials');
    }
  };

  return (
    <div style={{ maxWidth: '400px', margin: '2rem auto' }}>
      <h2>Login</h2>
      {error && <p style={{ color: '#f44336' }}>{error}</p>}
      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.25rem' }}>Password</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} required style={{ width: '100%', padding: '0.5rem', borderRadius: '4px', border: '1px solid #ccc' }} />
        </div>
        <button type="submit" disabled={loading} style={{ width: '100%', padding: '0.6rem', background: '#e94560', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer' }}>
          {loading ? 'Loading...' : 'Login'}
        </button>
      </form>
      <p style={{ textAlign: 'center', marginTop: '1rem' }}>No account? <Link to="/register">Register</Link></p>
    </div>
  );
}
