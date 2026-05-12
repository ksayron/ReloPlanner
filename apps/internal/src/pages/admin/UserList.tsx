import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import client from '../../api/client';
import type { Role } from '../../types';

interface UserListItem {
  id: string;
  displayName: string | null;
  email: string;
  role: Role;
  isBlocked: boolean;
  createdAt: string;
}

const roleColor = (role: Role) => {
  if (role === 'ADMIN') return 'red';
  if (role === 'PREMIUM') return 'yellow';
  return 'gray';
};

export default function UserList() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [activeUserId, setActiveUserId] = useState<string | null>(null);

  const [nameFilter, setNameFilter] = useState('');
  const [emailFilter, setEmailFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState<Role | null>(null);
  const [appliedFilters, setAppliedFilters] = useState<{
    displayName: string;
    email: string;
    role: Role | null;
  }>({
    displayName: '',
    email: '',
    role: null,
  });

  const filterParams = useMemo(() => {
    const params: Record<string, string> = {};
    const name = appliedFilters.displayName.trim();
    const email = appliedFilters.email.trim();
    if (name) params.displayName = name;
    if (email) params.email = email;
    if (appliedFilters.role) params.role = appliedFilters.role;
    return params;
  }, [appliedFilters]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await client.get<UserListItem[]>('/admin/users', {
        params: filterParams,
      });
      setUsers(res.data);
    } catch {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [filterParams]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleClearFilters = () => {
    setNameFilter('');
    setEmailFilter('');
    setRoleFilter(null);
    setAppliedFilters({
      displayName: '',
      email: '',
      role: null,
    });
  };

  const handleApplyFilters = () => {
    setAppliedFilters({
      displayName: nameFilter,
      email: emailFilter,
      role: roleFilter,
    });
  };

  const handleToggleBlock = async (user: UserListItem) => {
    setActionError('');
    setActiveUserId(user.id);
    try {
      await client.patch(`/admin/users/${user.id}/block`, {
        blocked: !user.isBlocked,
      });
      await loadUsers();
    } catch {
      setActionError(`Failed to ${user.isBlocked ? 'unblock' : 'block'} user.`);
    } finally {
      setActiveUserId(null);
    }
  };

  const handleDelete = async (user: UserListItem) => {
    const confirmed = window.confirm(
      `Delete user "${user.displayName || user.email}"? This action cannot be undone.`,
    );
    if (!confirmed) {
      return;
    }

    setActionError('');
    setActiveUserId(user.id);
    try {
      await client.delete(`/admin/users/${user.id}`);
      await loadUsers();
    } catch {
      setActionError('Failed to delete user.');
    } finally {
      setActiveUserId(null);
    }
  };

  if (loading) {
    return (
      <div className="mt-10 flex justify-center">
        <Loader color="brand.7" />
      </div>
    );
  }

  return (
    <Stack className="mx-auto max-w-6xl" gap="lg">
      <Title order={2}>User Management</Title>
      {error && <Alert color="red">{error}</Alert>}
      {actionError && <Alert color="red">{actionError}</Alert>}

      <Paper withBorder radius="lg" p="md" className="bg-white">
        <Stack gap="sm">
          <Group grow align="end">
            <TextInput
              label="Filter by name"
              placeholder="e.g. Alex"
              value={nameFilter}
              onChange={(event) => setNameFilter(event.currentTarget.value)}
            />
            <TextInput
              label="Filter by email"
              placeholder="e.g. user@example.com"
              value={emailFilter}
              onChange={(event) => setEmailFilter(event.currentTarget.value)}
            />
            <Select
              label="Filter by role"
              placeholder="All roles"
              clearable
              value={roleFilter}
              onChange={(value) => setRoleFilter((value as Role | null) ?? null)}
              data={[
                { value: 'USER', label: 'USER' },
                { value: 'PREMIUM', label: 'PREMIUM' },
                { value: 'ADMIN', label: 'ADMIN' },
              ]}
            />
          </Group>
          <Group>
            <Button color="brand.7" variant="light" onClick={handleApplyFilters}>
              Apply filters
            </Button>
            <Button variant="light" color="gray" onClick={handleClearFilters}>
              Clear
            </Button>
          </Group>
        </Stack>
      </Paper>

      <Paper withBorder radius="lg" p="md" className="bg-white">
        <Table striped highlightOnHover withTableBorder withColumnBorders>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Name</Table.Th>
              <Table.Th>Email</Table.Th>
              <Table.Th>Role</Table.Th>
              <Table.Th>Status</Table.Th>
              <Table.Th>Created</Table.Th>
              <Table.Th>Actions</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {users.map((user) => {
              const isAdmin = user.role === 'ADMIN';
              const isBusy = activeUserId === user.id;

              return (
                <Table.Tr key={user.id}>
                  <Table.Td>{user.displayName || '-'}</Table.Td>
                  <Table.Td>{user.email}</Table.Td>
                  <Table.Td>
                    <Badge color={roleColor(user.role)}>{user.role}</Badge>
                  </Table.Td>
                  <Table.Td>
                    <Badge color={user.isBlocked ? 'red' : 'green'}>
                      {user.isBlocked ? 'Blocked' : 'Active'}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text c="dimmed" size="sm">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button
                        size="xs"
                        variant="light"
                        color={user.isBlocked ? 'green' : 'orange'}
                        disabled={isAdmin || isBusy}
                        loading={isBusy}
                        onClick={() => void handleToggleBlock(user)}
                      >
                        {user.isBlocked ? 'Unblock' : 'Block'}
                      </Button>
                      <Button
                        size="xs"
                        color="red"
                        variant="light"
                        disabled={isAdmin || isBusy}
                        loading={isBusy}
                        onClick={() => void handleDelete(user)}
                      >
                        Delete
                      </Button>
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>

      {users.length === 0 && !error && <Text c="dimmed" ta="center">No users found.</Text>}
    </Stack>
  );
}
