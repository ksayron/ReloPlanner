import { Outlet, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../api/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <nav style={{ display: 'flex', gap: '1rem', padding: '1rem', background: '#1a1a2e', color: '#fff', alignItems: 'center' }}>
        <Link to="/" style={{ color: '#e94560', fontWeight: 'bold', fontSize: '1.2rem', textDecoration: 'none' }}>ReloPlanner</Link>
        <Link to="/cost-of-living" style={{ color: '#fff', textDecoration: 'none' }}>Cost of Living</Link>
        {user && <Link to="/profiles" style={{ color: '#fff', textDecoration: 'none' }}>My Profiles</Link>}
        {user && <Link to="/wizard" style={{ color: '#fff', textDecoration: 'none' }}>New Profile</Link>}
        <div style={{ flex: 1 }} />
        {user?.role === 'ADMIN' && (
          <>
            <Link to="/admin/taxonomy" style={{ color: '#ffc947', textDecoration: 'none' }}>Taxonomy</Link>
            <Link to="/admin/market" style={{ color: '#ffc947', textDecoration: 'none' }}>Market</Link>
            <Link to="/admin/users" style={{ color: '#ffc947', textDecoration: 'none' }}>Users</Link>
            <Link to="/admin/sync" style={{ color: '#ffc947', textDecoration: 'none' }}>Sync</Link>
          </>
        )}
        {user ? (
          <>
            <span style={{ color: '#aaa' }}>{user.email}</span>
            <button onClick={handleLogout} style={{ background: '#e94560', color: '#fff', border: 'none', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}>Logout</button>
          </>
        ) : (
          <>
            <Link to="/login" style={{ color: '#fff', textDecoration: 'none' }}>Login</Link>
            <Link to="/register" style={{ color: '#fff', textDecoration: 'none' }}>Register</Link>
          </>
        )}
      </nav>
      <main style={{ flex: 1, padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
        <Outlet />
      </main>
    </div>
  );
}
