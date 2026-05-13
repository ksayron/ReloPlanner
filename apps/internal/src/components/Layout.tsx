import { Outlet, Link as RouterLink, useNavigate } from 'react-router-dom';
import { useEffect, useMemo } from 'react';
import {
  ActionIcon,
  AppShell,
  Anchor,
  Burger,
  Button,
  Divider,
  Drawer,
  Group,
  Stack,
  Text,
  Tooltip,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '@reloplanner/shared-frontend';
import { fetchMyPreferences, updateMyPreferences } from '../api/preferences';

const colorSchemeStorageKey = 'reloplanner-color-scheme';

const readStoredColorScheme = (): 'light' | 'dark' | null => {
  const value = localStorage.getItem(colorSchemeStorageKey);
  return value === 'light' || value === 'dark' ? value : null;
};

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
      <path
        d="M12 2.5V5.5M12 18.5V21.5M21.5 12H18.5M5.5 12H2.5M18.72 5.28L16.6 7.4M7.4 16.6L5.28 18.72M18.72 18.72L16.6 16.6M7.4 7.4L5.28 5.28"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20 14.2A8.5 8.5 0 1 1 9.8 4 7 7 0 1 0 20 14.2Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [opened, { toggle, close }] = useDisclosure(false);
  const clientAppUrl = import.meta.env.DEV ? 'http://localhost:5173/' : '/';
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light');

  const adminLinks = useMemo(() => {
    const links = [
      { to: '/cases', label: 'Cases' },
      { to: '/chats', label: 'Chats' },
      { to: '/sync', label: 'Sync' },
      { to: '/system', label: 'System' },
      { to: '/taxonomy', label: 'Taxonomy' },
      { to: '/market', label: 'Market' },
      { to: '/users', label: 'Users' },
    ];
    if (user?.role === 'SPECIALIST') {
      return links.filter((link) => link.to === '/cases' || link.to === '/chats');
    }
    return links;
  }, [user?.role]);

  const handleLogout = () => {
    logout();
    navigate('/login');
    close();
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    let alive = true;
    void (async () => {
      try {
        const preferences = await fetchMyPreferences();
        if (!alive || !preferences) return;

        const localColorScheme = readStoredColorScheme();
        if (localColorScheme) {
          setColorScheme(localColorScheme);
          if (preferences.preferredTheme !== localColorScheme) {
            void updateMyPreferences({ preferredTheme: localColorScheme }).catch(() => {
              // Ignore preference sync failures to avoid blocking navigation.
            });
          }
          return;
        }

        setColorScheme(preferences.preferredTheme);
      } catch {
        // Ignore preference sync failures to avoid blocking navigation.
      }
    })();

    return () => {
      alive = false;
    };
  }, [setColorScheme, user]);

  const handleThemeToggle = () => {
    const nextTheme = computedColorScheme === 'dark' ? 'light' : 'dark';
    setColorScheme(nextTheme);
    if (!user) return;
    void updateMyPreferences({ preferredTheme: nextTheme }).catch(() => {
      // Keep UI responsive even if theme persistence fails.
    });
  };

  const themeToggleLabel =
    computedColorScheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
  const themeToggleIcon = computedColorScheme === 'dark' ? <SunIcon /> : <MoonIcon />;

  return (
    <>
      <AppShell header={{ height: 72 }} padding="md" className="min-h-screen bg-[var(--app-bg)]">
        <AppShell.Header style={{ borderBottom: '1px solid var(--app-border)' }}>
          <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4">
            <Group gap="md">
              <Burger opened={opened} onClick={toggle} size="sm" aria-label="Open internal menu" />
              <Anchor component={RouterLink} to="/cases" underline="never">
                <Title order={3} c="brand.7">
                  ReloPlanner Internal
                </Title>
              </Anchor>
            </Group>
            <Group gap="sm">
              <Tooltip label={themeToggleLabel} withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size="lg"
                  aria-label={themeToggleLabel}
                  onClick={handleThemeToggle}
                >
                  {themeToggleIcon}
                </ActionIcon>
              </Tooltip>
              {user ? <Text size="sm">{user.email}</Text> : null}
              <Button variant="subtle" component="a" href={clientAppUrl}>
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
          <Button variant="light" color="gray" onClick={handleThemeToggle}>
            {themeToggleLabel}
          </Button>
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
          <Anchor component="a" href={clientAppUrl} underline="never" onClick={close}>
            Open Client App
          </Anchor>
        </Stack>
      </Drawer>
    </>
  );
}
