import { Outlet, Link as RouterLink, useNavigate } from 'react-router-dom';
import {
  AppShell,
  Anchor,
  Burger,
  Button,
  Divider,
  Drawer,
  Group,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '../api/AuthContext';

const linkClass = 'text-slate-700 hover:text-slate-900';
const adminLinkClass = 'text-[var(--app-accent)] hover:text-[#316684]';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [opened, { open, close }] = useDisclosure(false);

  const handleLogout = () => {
    logout();
    navigate('/');
    close();
  };

  return (
    <>
      <AppShell header={{ height: 72 }} padding="md" className="min-h-screen bg-[var(--app-bg)]">
        <AppShell.Header className="border-b border-slate-200 bg-white/95">
          <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4">
            <Group gap="md">
              <Burger opened={opened} onClick={open} hiddenFrom="md" size="sm" />
              <Anchor component={RouterLink} to="/" underline="never">
                <Title order={3} c="brand.7">ReloPlanner</Title>
              </Anchor>
            </Group>

            <Group gap="lg" visibleFrom="md">
              <Anchor component={RouterLink} to="/cost-of-living" className={linkClass} underline="never">
                Cost of Living
              </Anchor>
              {user && (
                <>
                  <Anchor component={RouterLink} to="/profiles" className={linkClass} underline="never">
                    My Profiles
                  </Anchor>
                  <Anchor component={RouterLink} to="/wizard" className={linkClass} underline="never">
                    New Profile
                  </Anchor>
                </>
              )}
              {user?.role === 'ADMIN' && (
                <>
                  <Anchor component={RouterLink} to="/admin/taxonomy" className={adminLinkClass} underline="never">
                    Taxonomy
                  </Anchor>
                  <Anchor component={RouterLink} to="/admin/market" className={adminLinkClass} underline="never">
                    Market
                  </Anchor>
                  <Anchor component={RouterLink} to="/admin/users" className={adminLinkClass} underline="never">
                    Users
                  </Anchor>
                  <Anchor component={RouterLink} to="/admin/sync" className={adminLinkClass} underline="never">
                    Sync
                  </Anchor>
                </>
              )}
            </Group>

            <Group gap="sm" visibleFrom="md">
              {user ? (
                <>
                  <Text c="dimmed" size="sm">{user.email}</Text>
                  <Button variant="filled" color="brand.7" onClick={handleLogout}>Logout</Button>
                </>
              ) : (
                <>
                  <Button component={RouterLink} to="/login" variant="subtle" color="brand.7">Login</Button>
                  <Button component={RouterLink} to="/register" color="brand.7">Register</Button>
                </>
              )}
            </Group>
          </div>
        </AppShell.Header>

        <AppShell.Main>
          <div className="mx-auto w-full max-w-7xl px-2 pb-8 pt-4 md:px-4">
            <Outlet />
          </div>
        </AppShell.Main>
      </AppShell>

      <Drawer opened={opened} onClose={close} title="Navigation" padding="md" size="xs" hiddenFrom="md">
        <Stack gap="sm">
          <Anchor component={RouterLink} to="/cost-of-living" underline="never" onClick={close}>Cost of Living</Anchor>
          {user && (
            <>
              <Anchor component={RouterLink} to="/profiles" underline="never" onClick={close}>My Profiles</Anchor>
              <Anchor component={RouterLink} to="/wizard" underline="never" onClick={close}>New Profile</Anchor>
            </>
          )}
          {user?.role === 'ADMIN' && (
            <>
              <Divider />
              <Anchor component={RouterLink} to="/admin/taxonomy" underline="never" onClick={close}>Taxonomy</Anchor>
              <Anchor component={RouterLink} to="/admin/market" underline="never" onClick={close}>Market</Anchor>
              <Anchor component={RouterLink} to="/admin/users" underline="never" onClick={close}>Users</Anchor>
              <Anchor component={RouterLink} to="/admin/sync" underline="never" onClick={close}>Sync</Anchor>
            </>
          )}
          <Divider />
          {user ? (
            <>
              <Text size="sm" c="dimmed">{user.email}</Text>
              <Button color="brand.7" onClick={handleLogout}>Logout</Button>
            </>
          ) : (
            <Group grow>
              <Button component={RouterLink} to="/login" variant="light" color="brand.7" onClick={close}>Login</Button>
              <Button component={RouterLink} to="/register" color="brand.7" onClick={close}>Register</Button>
            </Group>
          )}
        </Stack>
      </Drawer>
    </>
  );
}
