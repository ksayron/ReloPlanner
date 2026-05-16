import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import i18n from './index';
import { fetchMyPreferences, updateMyPreferences } from '../api/preferences';
import { useAuth } from '../api/AuthContext';
import type { AppLanguage } from './resources';

const storageKey = 'reloplanner-language';

interface AppLanguageContextValue {
  language: AppLanguage;
  setLanguage: (language: AppLanguage) => Promise<void>;
}

const AppLanguageContext = createContext<AppLanguageContextValue | null>(null);

function normalizeLanguage(value: string | null | undefined): AppLanguage | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (normalized.startsWith('ru')) return 'ru';
  if (normalized.startsWith('en')) return 'en';
  return null;
}

function resolveBrowserLanguage(): AppLanguage {
  return normalizeLanguage(navigator.language) ?? 'en';
}

function readStoredLanguage(): AppLanguage | null {
  return normalizeLanguage(localStorage.getItem(storageKey));
}

export function AppLanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [language, setLanguageState] = useState<AppLanguage>(() => readStoredLanguage() ?? resolveBrowserLanguage());
  const initialPreferenceAppliedRef = useRef(false);

  const applyLanguage = useCallback((next: AppLanguage) => {
    setLanguageState(next);
    if (i18n.language !== next) {
      void i18n.changeLanguage(next);
    }
    document.documentElement.lang = next;
  }, []);

  useEffect(() => {
    applyLanguage(language);
  }, [applyLanguage, language]);

  useEffect(() => {
    if (!user) {
      initialPreferenceAppliedRef.current = false;
      const stored = readStoredLanguage();
      if (stored) {
        applyLanguage(stored);
      }
      return;
    }

    const stored = readStoredLanguage();
    if (stored) {
      applyLanguage(stored);
      return;
    }
    if (initialPreferenceAppliedRef.current) return;

    let cancelled = false;
    void (async () => {
      try {
        const preferences = await fetchMyPreferences();
        if (cancelled || !preferences) return;
        const preferred = normalizeLanguage(preferences.preferredLanguage) ?? 'en';
        applyLanguage(preferred);
      } finally {
        if (!cancelled) {
          initialPreferenceAppliedRef.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [applyLanguage, user]);

  const setLanguage = useCallback(
    async (nextLanguage: AppLanguage) => {
      localStorage.setItem(storageKey, nextLanguage);
      applyLanguage(nextLanguage);
      if (!user) return;
      try {
        await updateMyPreferences({ preferredLanguage: nextLanguage });
      } catch {
        // Keep language switch immediate even if preference sync fails.
      }
    },
    [applyLanguage, user],
  );

  const value = useMemo<AppLanguageContextValue>(
    () => ({
      language,
      setLanguage,
    }),
    [language, setLanguage],
  );

  return <AppLanguageContext.Provider value={value}>{children}</AppLanguageContext.Provider>;
}

export function useAppLanguage() {
  const value = useContext(AppLanguageContext);
  if (!value) {
    throw new Error('useAppLanguage must be used inside AppLanguageProvider');
  }
  return value;
}
