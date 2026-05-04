import { useState, useEffect } from 'react';
import client from '../../api/client';
import type { User } from '../../types';

interface UserListItem extends User {
  createdAt: string;
}

export default function UserList() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/admin/users')
      .then(res => setUsers(res.data))
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p style={{ textAlign: 'center', marginTop: '2rem' }}>Loading...</p>;

  return (
    <div style={{ maxWidth: '800px', margin: '2rem auto' }}>
      <h2>User Management</h2>
      {error && <p style={{ color: '#f44336' }}>{error}</p>}

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f5f5f5' }}>
            <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Email</th>
            <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Role</th>
            <th style={{ padding: '0.6rem', textAlign: 'left', borderBottom: '2px solid #ddd' }}>Created</th>
          </tr>
        </thead>
        <tbody>
          {users.map(user => (
            <tr key={user.id}>
              <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>{user.email}</td>
              <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee' }}>
                <span style={{
                  background: user.role === 'ADMIN' ? '#e94560' : user.role === 'PREMIUM' ? '#ff9800' : '#eee',
                  color: user.role === 'ADMIN' || user.role === 'PREMIUM' ? '#fff' : '#333',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                }}>
                  {user.role}
                </span>
              </td>
              <td style={{ padding: '0.5rem', borderBottom: '1px solid #eee', color: '#666' }}>
                {new Date(user.createdAt).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {users.length === 0 && !error && <p style={{ color: '#999', textAlign: 'center', marginTop: '1rem' }}>No users found.</p>}
    </div>
  );
}
