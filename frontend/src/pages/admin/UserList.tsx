import { useState, useEffect } from 'react';
import { Alert, Badge, Loader, Paper, Stack, Table, Text, Title } from '@mantine/core';
import client from '../../api/client';
import type { User } from '../../types';

interface UserListItem extends User {
  createdAt: string;
}

const roleColor = (role: User['role']) => {
  if (role === 'ADMIN') return 'red';
  if (role === 'PREMIUM') return 'yellow';
  return 'gray';
};

export default function UserList() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    client
      .get('/admin/users')
      .then((res) => setUsers(res.data))
      .catch(() => setError('Failed to load users'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader color="brand.7" />
      </div>
    );
  }

  return (
    <Stack className="mx-auto max-w-5xl" gap="lg">
      <Title order={2}>User Management</Title>
      {error && <Alert color="red">{error}</Alert>}

      <Paper withBorder radius="lg" p="md" className="bg-white">
        <Table striped highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Created</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((user) => (
              <Table.Tr key={user.id}>
                <Table.Td>{user.email}</Table.Td>
                <Table.Td>
                  <Badge color={roleColor(user.role)}>{user.role}</Badge>
                </Table.Td>
                <Table.Td>
                  <Text c="dimmed" size="sm">{new Date(user.createdAt).toLocaleDateString()}</Text>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>

      {users.length === 0 && !error && <Text c="dimmed" ta="center">No users found.</Text>}
    </Stack>
  );
}
