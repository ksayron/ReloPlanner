import { Outlet, Link as RouterLink, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useState } from 'react';
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
  Select,
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
import { getCaseChatsUnreadCount } from '../api/cases';
import { fetchMyPreferences, updateMyPreferences } from '../api/preferences';
import type { BillingPlanCode } from '../types';
import { useRealtimeCase } from '@reloplanner/shared-frontend';
import { useAppLanguage } from '../i18n/AppLanguageProvider';
import { useTranslation } from 'react-i18next';

const linkClass = 'text-[var(--app-nav-link)] hover:text-[var(--app-nav-link-hover)]';
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
  const { t } = useTranslation(['layout', 'common']);
  const { user, token, logout } = useAuth();
  const { language, setLanguage } = useAppLanguage();
  const navigate = useNavigate();
  const [opened, { toggle, close }] = useDisclosure(false);
  const [planCode, setPlanCode] = useState<BillingPlanCode | null>(null);
  const [chatUnread, setChatUnread] = useState(0);
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

  const handleLogout = () => {
    logout();
    navigate('/');
    close();
  };

  const effectivePlan = user?.role === 'ADMIN' ? null : planCode;
  const canAccessCasesAndChats = Boolean(
    user && (user.role === 'ADMIN' || effectivePlan === 'PREMIUM'),
  );

  const refreshUnreadCount = useCallback(async () => {
    if (!user || !canAccessCasesAndChats) {
      setChatUnread(0);
      return;
    }
    try {
      const payload = await getCaseChatsUnreadCount();
      setChatUnread(payload.unreadCount);
    } catch {
      // Keep UI non-blocking.
    }
  }, [canAccessCasesAndChats, user]);

  useEffect(() => {
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  useRealtimeCase({
    token: canAccessCasesAndChats ? token : null,
    onCaseMessageCreated: () => {
      void refreshUnreadCount();
    },
    onCaseMessageRead: () => {
      void refreshUnreadCount();
    },
    onNotificationCreated: () => {
      void refreshUnreadCount();
    },
    onNotificationRead: () => {
      void refreshUnreadCount();
    },
  });

  const handleThemeToggle = () => {
    const nextTheme = computedColorScheme === 'dark' ? 'light' : 'dark';
    setColorScheme(nextTheme);
    if (!user) return;
    void updateMyPreferences({ preferredTheme: nextTheme }).catch(() => {
      // Keep UI responsive even if theme persistence fails.
    });
  };

  const themeToggleLabel =
    computedColorScheme === 'dark'
      ? t('switchToLightMode', { ns: 'layout' })
      : t('switchToDarkMode', { ns: 'layout' });
  const themeToggleIcon = computedColorScheme === 'dark' ? <SunIcon /> : <MoonIcon />;

  const planColor = effectivePlan === 'PREMIUM' ? 'teal' : 'gray';
  const planLabel =
    effectivePlan === 'PREMIUM'
      ? t('premium', { ns: 'common' })
      : t('free', { ns: 'common' });
  const internalAppUrl = import.meta.env.DEV
    ? 'http://localhost:5174/internal/sync'
    : '/internal/sync';

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
                aria-label={t('openNavigationMenu', { ns: 'layout' })}
              />
              <Anchor component={RouterLink} to="/" underline="never">
                <Title order={3} c="brand.7">
                  {t('appTitle', { ns: 'layout' })}
                </Title>
              </Anchor>
            </Group>

            <Group gap="lg" visibleFrom="md">
              <Anchor
                component={RouterLink}
                to="/knowledge"
                className={linkClass}
                underline="never"
              >
                {t('knowledgeBase', { ns: 'layout' })}
              </Anchor>
              {user && (
                <>
                  <Anchor
                    component={RouterLink}
                    to="/jobs"
                    className={linkClass}
                    underline="never"
                  >
                    {t('jobs', { ns: 'layout' })}
                  </Anchor>
                  <Anchor
                    component={RouterLink}
                    to="/profiles"
                    className={linkClass}
                    underline="never"
                  >
                    {t('myProfiles', { ns: 'layout' })}
                  </Anchor>
                  {canAccessCasesAndChats ? (
                    <>
                      <Anchor
                        component={RouterLink}
                        to="/cases"
                        className={linkClass}
                        underline="never"
                      >
                        {t('cases', { ns: 'layout' })}
                      </Anchor>
                      <Anchor
                        component={RouterLink}
                        to="/chats"
                        className={linkClass}
                        underline="never"
                      >
                        <Group gap={6}>
                          <span>{t('chats', { ns: 'layout' })}</span>
                          {chatUnread > 0 ? (
                            <Badge color="red" size="xs" variant="filled">
                              {chatUnread}
                            </Badge>
                          ) : null}
                        </Group>
                      </Anchor>
                    </>
                  ) : null}
                </>
              )}
            </Group>

            <Group gap="sm" visibleFrom="md">
              <Select
                w={112}
                aria-label={t('language', { ns: 'common' })}
                value={language}
                onChange={(value) => {
                  if (!value || (value !== 'en' && value !== 'ru')) return;
                  void setLanguage(value);
                }}
                data={[
                  { value: 'en', label: 'EN' },
                  { value: 'ru', label: 'RU' },
                ]}
              />
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
                      <Menu.Label>{t('account', { ns: 'layout' })}</Menu.Label>
                      {user.role === 'ADMIN' ? (
                        <Menu.Item component="a" href={internalAppUrl}>
                          {t('openInternalWorkspace', { ns: 'layout' })}
                        </Menu.Item>
                      ) : null}
                      <Menu.Item component={RouterLink} to="/settings">
                        {t('settings', { ns: 'layout' })}
                      </Menu.Item>
                      <Menu.Item component={RouterLink} to="/plan">
                        {t('plan', { ns: 'layout' })}
                      </Menu.Item>
                      <Menu.Item disabled>{t('moreOptionsSoon', { ns: 'layout' })}</Menu.Item>
                      <Menu.Divider />
                      <Menu.Item color="red" onClick={handleLogout}>
                        {t('logout', { ns: 'layout' })}
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
                    {t('login', { ns: 'layout' })}
                  </Button>
                  <Button component={RouterLink} to="/register" color="brand.7">
                    {t('register', { ns: 'layout' })}
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
        title={t('navigation', { ns: 'layout' })}
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
            {t('costOfLiving', { ns: 'layout' })}
          </Anchor>
          <Anchor
            component={RouterLink}
            to="/knowledge"
            underline="never"
            onClick={close}
          >
            {t('knowledgeBase', { ns: 'layout' })}
          </Anchor>
          {user && (
            <>
              <Anchor
                component={RouterLink}
                to="/jobs"
                underline="never"
                onClick={close}
              >
                {t('jobs', { ns: 'layout' })}
              </Anchor>
              <Anchor
                component={RouterLink}
                to="/profiles"
                underline="never"
                onClick={close}
              >
                {t('myProfiles', { ns: 'layout' })}
              </Anchor>
              {canAccessCasesAndChats ? (
                <>
                  <Anchor
                    component={RouterLink}
                    to="/cases"
                    underline="never"
                    onClick={close}
                  >
                    {t('cases', { ns: 'layout' })}
                  </Anchor>
                  <Anchor
                    component={RouterLink}
                    to="/chats"
                    underline="never"
                    onClick={close}
                  >
                    <Group gap={6}>
                      <span>{t('chats', { ns: 'layout' })}</span>
                      {chatUnread > 0 ? (
                        <Badge color="red" size="xs" variant="filled">
                          {chatUnread}
                        </Badge>
                      ) : null}
                    </Group>
                  </Anchor>
                </>
              ) : null}
              <Anchor
                component={RouterLink}
                to="/wizard"
                underline="never"
                onClick={close}
              >
                {t('newProfile', { ns: 'layout' })}
              </Anchor>
              <Anchor
                component={RouterLink}
                to="/settings"
                underline="never"
                onClick={close}
              >
                {t('settings', { ns: 'layout' })}
              </Anchor>
              <Anchor
                component={RouterLink}
                to="/plan"
                underline="never"
                onClick={close}
              >
                {t('plan', { ns: 'layout' })}
              </Anchor>
            </>
          )}
          {user?.role === 'ADMIN' ? (
            <>
              <Divider />
              <Text size="xs" c="dimmed" fw={700} tt="uppercase">
                {t('internalWorkspace', { ns: 'layout' })}
              </Text>
              <Anchor component="a" href={internalAppUrl} underline="never" onClick={close}>
                {t('openInternalApp', { ns: 'layout' })}
              </Anchor>
            </>
          ) : null}
          <Divider />
          {user ? (
            <>
              <Text size="sm" c="dimmed">
                {user.email}
              </Text>
              {effectivePlan ? (
                <Badge color={planColor} variant="light" w="fit-content">
                  {t('currentPlan', { ns: 'layout', plan: planLabel })}
                </Badge>
              ) : null}
              <Button color="brand.7" onClick={handleLogout}>
                {t('logout', { ns: 'layout' })}
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
                {t('login', { ns: 'layout' })}
              </Button>
              <Button
                component={RouterLink}
                to="/register"
                color="brand.7"
                onClick={close}
              >
                {t('register', { ns: 'layout' })}
              </Button>
            </Group>
          )}
                    <Select
            label={t('language', { ns: 'common' })}
            value={language}
            onChange={(value) => {
              if (!value || (value !== 'en' && value !== 'ru')) return;
              void setLanguage(value);
            }}
            data={[
              { value: 'en', label: t('english', { ns: 'common' }) },
              { value: 'ru', label: t('russian', { ns: 'common' }) },
            ]}
          />
          <Button variant="light" color="gray" onClick={handleThemeToggle}>
            {themeToggleLabel}
          </Button>
        </Stack>
      </Drawer>
    </>
  );
}
