import { Outlet, Link as RouterLink, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import {
  ActionIcon,
  AppShell,
  Anchor,
  Badge,
  Burger,
  Button,
  Divider,
  Drawer,
  Group,
  Menu,
  Stack,
  Text,
  Tooltip,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAuth } from '../api/AuthContext';
import { getBillingStatus } from '../api/billing';
import { fetchMyPreferences, updateMyPreferences } from '../api/preferences';
import type { BillingPlanCode } from '../types';

const linkClass = 'text-[var(--app-nav-link)] hover:text-[var(--app-nav-link-hover)]';

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
  const [planCode, setPlanCode] = useState<BillingPlanCode | null>(null);
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light');

  useEffect(() => {
    if (!user) {
      setPlanCode(null);
      return;
    }

    let alive = true;
    void (async () => {
      try {
        const status = await getBillingStatus();
        if (!alive) return;
        setPlanCode(status.plan.code);
      } catch {
        if (!alive) return;
        setPlanCode(user.role === 'PREMIUM' ? 'PREMIUM' : 'FREE');
      }
    })();

    return () => {
      alive = false;
    };
  }, [user]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let alive = true;
    void (async () => {
      try {
        const preferences = await fetchMyPreferences();
        if (!alive || !preferences) return;
        setColorScheme(preferences.preferredTheme);
      } catch {
        // Ignore preference sync failures to avoid blocking navigation.
      }
    })();

    return () => {
      alive = false;
    };
  }, [setColorScheme, user]);

  const handleLogout = () => {
    logout();
    navigate('/');
    close();
  };

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

  const effectivePlan = user?.role === 'ADMIN' ? null : planCode;
  const planColor = effectivePlan === 'PREMIUM' ? 'teal' : 'gray';
  const planLabel = effectivePlan === 'PREMIUM' ? 'Premium' : 'Free';

  return (
    <>
      <AppShell
        header={{ height: 72 }}
        padding="md"
        className="min-h-screen bg-[var(--app-bg)]"
      >
        <AppShell.Header
          className="border-b bg-[var(--app-shell-header-bg)]"
          style={{ borderColor: 'var(--app-border)' }}
        >
          <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4">
            <Group gap="md">
              <Burger
                opened={opened}
                onClick={toggle}
                size="sm"
                aria-label="Open navigation menu"
              />
              <Anchor component={RouterLink} to="/" underline="never">
                <Title order={3} c="brand.7">
                  ReloPlanner
                </Title>
              </Anchor>
            </Group>

            <Group gap="lg" visibleFrom="md">
              <Anchor
                component={RouterLink}
                to="/cost-of-living"
                className={linkClass}
                underline="never"
              >
                Cost of Living
              </Anchor>
              <Anchor
                component={RouterLink}
                to="/knowledge"
                className={linkClass}
                underline="never"
              >
                Knowledge Base
              </Anchor>
              {user && (
                <>
                  <Anchor
                    component={RouterLink}
                    to="/profiles"
                    className={linkClass}
                    underline="never"
                  >
                    My Profiles
                  </Anchor>
                  <Anchor
                    component={RouterLink}
                    to="/wizard"
                    className={linkClass}
                    underline="never"
                  >
                    New Profile
                  </Anchor>
                </>
              )}
            </Group>

            <Group gap="sm" visibleFrom="md">
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
              {user ? (
                <Group gap="xs">
                  <Menu width={220} shadow="md" position="bottom-end">
                    <Menu.Target>
                      <Button variant="subtle" color="gray">
                        {user.email}
                      </Button>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Label>Account</Menu.Label>
                      <Menu.Item component={RouterLink} to="/settings">
                        Settings
                      </Menu.Item>
                      <Menu.Item component={RouterLink} to="/plan">
                        Plan
                      </Menu.Item>
                      <Menu.Item disabled>More options soon</Menu.Item>
                      <Menu.Divider />
                      <Menu.Item color="red" onClick={handleLogout}>
                        Logout
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                  {effectivePlan ? (
                    <Badge color={planColor} variant="light">
                      {planLabel}
                    </Badge>
                  ) : null}
                </Group>
              ) : (
                <>
                  <Button
                    component={RouterLink}
                    to="/login"
                    variant="subtle"
                    color="brand.7"
                  >
                    Login
                  </Button>
                  <Button component={RouterLink} to="/register" color="brand.7">
                    Register
                  </Button>
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

      <Drawer
        opened={opened}
        onClose={close}
        title="Navigation"
        padding="md"
        size="xs"
        position="left"
      >
        <Stack gap="sm">
          <Anchor
            component={RouterLink}
            to="/cost-of-living"
            underline="never"
            onClick={close}
          >
            Cost of Living
          </Anchor>
          <Anchor
            component={RouterLink}
            to="/knowledge"
            underline="never"
            onClick={close}
          >
            Knowledge Base
          </Anchor>
          <Button variant="light" color="gray" onClick={handleThemeToggle}>
            {themeToggleLabel}
          </Button>
          {user && (
            <>
              <Anchor
                component={RouterLink}
                to="/profiles"
                underline="never"
                onClick={close}
              >
                My Profiles
              </Anchor>
              <Anchor
                component={RouterLink}
                to="/wizard"
                underline="never"
                onClick={close}
              >
                New Profile
              </Anchor>
              <Anchor
                component={RouterLink}
                to="/settings"
                underline="never"
                onClick={close}
              >
                Settings
              </Anchor>
              <Anchor
                component={RouterLink}
                to="/plan"
                underline="never"
                onClick={close}
              >
                Plan
              </Anchor>
            </>
          )}
          {user?.role === 'ADMIN' && (
            <>
              <Divider />
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                Admin Panel
              </Text>
              <Anchor
                component={RouterLink}
                to="/admin/taxonomy"
                underline="never"
                onClick={close}
              >
                Taxonomy
              </Anchor>
              <Anchor
                component={RouterLink}
                to="/admin/market"
                underline="never"
                onClick={close}
              >
                Market
              </Anchor>
              <Anchor
                component={RouterLink}
                to="/admin/users"
                underline="never"
                onClick={close}
              >
                Users
              </Anchor>
              <Anchor
                component={RouterLink}
                to="/admin/sync"
                underline="never"
                onClick={close}
              >
                Sync
              </Anchor>
            </>
          )}
          <Divider />
          {user ? (
            <>
              <Text size="sm" c="dimmed">
                {user.email}
              </Text>
              {effectivePlan ? (
                <Badge color={planColor} variant="light" w="fit-content">
                  Current plan: {planLabel}
                </Badge>
              ) : null}
              <Button color="brand.7" onClick={handleLogout}>
                Logout
              </Button>
            </>
          ) : (
            <Group grow>
              <Button
                component={RouterLink}
                to="/login"
                variant="filled"
                color="brand.7"
                onClick={close}
              >
                Login
              </Button>
              <Button
                component={RouterLink}
                to="/register"
                color="brand.7"
                onClick={close}
              >
                Register
              </Button>
            </Group>
          )}
        </Stack>
      </Drawer>
    </>
  );
}
