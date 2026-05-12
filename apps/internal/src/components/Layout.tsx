import { Outlet, Link as RouterLink, useNavigate } from 'react-router-dom';
import { useMemo } from 'react';
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
import { useAuth } from '@reloplanner/shared-frontend';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [opened, { toggle, close }] = useDisclosure(false);

  const adminLinks = useMemo(
    () => [
      { to: '/sync', label: 'Sync' },
      { to: '/taxonomy', label: 'Taxonomy' },
      { to: '/market', label: 'Market' },
      { to: '/users', label: 'Users' },
    ],
    [],
  );

  const handleLogout = () => {
    logout();
    navigate('/login');
    close();
  };

  return (
    <>
      <AppShell header={{ height: 72 }} padding="md">
        <AppShell.Header style={{ borderBottom: '1px solid var(--app-border)' }}>
          <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4">
            <Group gap="md">
              <Burger opened={opened} onClick={toggle} size="sm" aria-label="Open internal menu" />
              <Anchor component={RouterLink} to="/sync" underline="never">
                <Title order={3} c="brand.7">
                  ReloPlanner Internal
                </Title>
              </Anchor>
            </Group>
            <Group gap="sm">
              {user ? <Text size="sm">{user.email}</Text> : null}
              <Button variant="subtle" component="a" href="/">
                Open Client App
              </Button>
              {user ? (
                <Button color="red" variant="light" onClick={handleLogout}>
                  Logout
                </Button>
              ) : (
                <Button component={RouterLink} to="/login" color="brand.7">
                  Login
                </Button>
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

      <Drawer
        opened={opened}
        onClose={close}
        title="Internal Navigation"
        padding="md"
        size="xs"
        position="left"
      >
        <Stack gap="sm">
          {adminLinks.map((link) => (
            <Anchor
              key={link.to}
              component={RouterLink}
              to={link.to}
              underline="never"
              onClick={close}
            >
              {link.label}
            </Anchor>
          ))}
          <Anchor component={RouterLink} to="/settings" underline="never" onClick={close}>
            Settings
          </Anchor>
          <Anchor component={RouterLink} to="/plan" underline="never" onClick={close}>
            Plan
          </Anchor>
          <Divider />
          <Anchor component="a" href="/" underline="never" onClick={close}>
            Open Client App
          </Anchor>
        </Stack>
      </Drawer>
    </>
  );
}
