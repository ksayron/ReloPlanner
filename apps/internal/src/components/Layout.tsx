import { Outlet, Link as RouterLink, useNavigate } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useState } from 'react';
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
  Select,
  Stack,
  Text,
  Tooltip,
  Title,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useAuth, useRealtimeCase } from '@reloplanner/shared-frontend';
import { useTranslation } from 'react-i18next';
import { getCaseChatsUnreadCount } from '../api/cases';
import { fetchMyPreferences, updateMyPreferences } from '../api/preferences';
import { useAppLanguage } from '../i18n/AppLanguageProvider';

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
  const { language, setLanguage } = useAppLanguage();
  const { user, token, logout } = useAuth();
  const navigate = useNavigate();
  const [opened, { toggle, close }] = useDisclosure(false);
  const [chatUnread, setChatUnread] = useState(0);
  const clientAppUrl = import.meta.env.DEV ? 'http://localhost:5173/' : '/';
  const { setColorScheme } = useMantineColorScheme();
  const computedColorScheme = useComputedColorScheme('light');

  const navigationLinks = useMemo(() => {
    const links = [
      { to: '/cases', label: t('cases', { ns: 'layout' }) },
      { to: '/chats', label: t('chats', { ns: 'layout' }) },
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
  }, [t, user?.role]);

  const handleLogout = () => {
    logout();
    navigate('/login');
    close();
  };

  const refreshUnreadCount = useCallback(async () => {
    if (!user) {
      setChatUnread(0);
      return;
    }
    try {
      const payload = await getCaseChatsUnreadCount();
      setChatUnread(payload.unreadCount);
    } catch {
      // Keep UI non-blocking.
    }
  }, [user]);

  useEffect(() => {
    void refreshUnreadCount();
  }, [refreshUnreadCount]);

  useRealtimeCase({
    token,
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
    computedColorScheme === 'dark'
      ? t('switchToLightMode', { ns: 'layout' })
      : t('switchToDarkMode', { ns: 'layout' });
  const themeToggleIcon = computedColorScheme === 'dark' ? <SunIcon /> : <MoonIcon />;

  return (
    <>
      <AppShell header={{ height: 72 }} padding="md" className="min-h-screen bg-[var(--app-bg)]">
        <AppShell.Header style={{ borderBottom: '1px solid var(--app-border)' }}>
          <div className="mx-auto flex h-full w-full max-w-7xl items-center justify-between px-4">
            <Group gap="md">
              <Burger
                opened={opened}
                onClick={toggle}
                size="sm"
                aria-label={t('openInternalMenu', { ns: 'layout' })}
              />
              <Anchor component={RouterLink} to="/cases" underline="never">
                <Title order={3} c="brand.7">
                  {t('appTitle', { ns: 'layout' })}
                </Title>
              </Anchor>
            </Group>
            <Group gap="sm">
              <Select
                w={88}
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
              {user ? <Text size="sm">{user.email}</Text> : null}
              <Button variant="subtle" component="a" href={clientAppUrl}>
                {t('openClientApp', { ns: 'layout' })}
              </Button>
              {user ? (
                <Button color="red" variant="light" onClick={handleLogout}>
                  {t('logout', { ns: 'layout' })}
                </Button>
              ) : (
                <Button component={RouterLink} to="/login" color="brand.7">
                  {t('login', { ns: 'layout' })}
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
        title={t('internalNavigation', { ns: 'layout' })}
        padding="md"
        size="xs"
        position="left"
      >
        <Stack gap="sm">
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
          {navigationLinks.map((link) => (
            <Anchor
              key={link.to}
              component={RouterLink}
              to={link.to}
              underline="never"
              onClick={close}
            >
              {link.to === '/chats' ? (
                <Group gap={6}>
                  <span>{link.label}</span>
                  {chatUnread > 0 ? (
                    <Badge color="red" size="xs" variant="filled">
                      {chatUnread}
                    </Badge>
                  ) : null}
                </Group>
              ) : (
                link.label
              )}
            </Anchor>
          ))}
          <Anchor component={RouterLink} to="/settings" underline="never" onClick={close}>
            {t('settings', { ns: 'layout' })}
          </Anchor>
          <Anchor component={RouterLink} to="/plan" underline="never" onClick={close}>
            {t('plan', { ns: 'layout' })}
          </Anchor>
          <Divider />
          <Anchor component="a" href={clientAppUrl} underline="never" onClick={close}>
            {t('openClientApp', { ns: 'layout' })}
          </Anchor>
        </Stack>
      </Drawer>
    </>
  );
}
