import {
  createContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
  useContext,
  type ReactNode,
} from 'react';
import {
  type AppBackgroundStyle,
} from '@client/shared/media/backgrounds/backgroundCatalog';
import {
  defaultStudio,
  defaultStudios,
  getStudioSchema,
  isDynamicStyle,
  migrateLegacyStudios,
  normalizeStudio,
  normalizeStudios,
  type BackgroundStudios,
  type DynamicBackgroundStyle,
  type StudioValues,
} from '@client/shared/media/backgrounds/studio';
import {
  createCustomPreset,
  CUSTOM_PRESET_LIMIT,
  emptyCustomPresets,
  normalizeCustomPresets,
  type CustomStudioPresetMap,
} from '@client/shared/media/backgrounds/studio/customPresets';

export type AppTheme = 'light' | 'dark' | 'system';
export type { AppBackgroundStyle, BackgroundStudios, StudioValues };

const STORAGE_KEY = 'beike_theme';
const BG_STORAGE_KEY = 'beike_bg_style';
const BG_TUNE_STORAGE_KEY = 'beike_bg_tune';
const BG_STUDIO_STORAGE_KEY = 'beike_bg_studio';
const BG_STUDIOS_STORAGE_KEY = 'beike_bg_studios';
const BG_CUSTOM_PRESETS_KEY = 'beike_bg_custom_presets';

const BACKGROUND_STYLES: AppBackgroundStyle[] = [
  'clean',
  'shards',
  'beams',
  'rays',
  'dots',
  'galaxy',
  'particles',
];

export function getInitialTheme(): AppTheme {
  if (typeof window === 'undefined') return 'light';
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as AppTheme | null;
    if (saved === 'light' || saved === 'dark' || saved === 'system') {
      return saved;
    }
  } catch {
    // ignore storage errors
  }
  return 'light';
}

export function normalizeBackgroundStyle(value: string | null): AppBackgroundStyle {
  if (value && BACKGROUND_STYLES.includes(value as AppBackgroundStyle)) {
    return value as AppBackgroundStyle;
  }
  return 'clean';
}

export function getInitialBackgroundStyle(): AppBackgroundStyle {
  if (typeof window === 'undefined') return 'clean';
  try {
    return normalizeBackgroundStyle(localStorage.getItem(BG_STORAGE_KEY));
  } catch {
    return 'clean';
  }
}

function readStoredJson(key: string): unknown {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function persistStudios(studios: BackgroundStudios) {
  try {
    localStorage.setItem(BG_STUDIOS_STORAGE_KEY, JSON.stringify(studios));
  } catch {
    // ignore
  }
}

function persistCustomPresets(presets: CustomStudioPresetMap) {
  try {
    localStorage.setItem(BG_CUSTOM_PRESETS_KEY, JSON.stringify(presets));
  } catch {
    // ignore
  }
}

function loadCustomPresets(): CustomStudioPresetMap {
  if (typeof window === 'undefined') return emptyCustomPresets();
  return normalizeCustomPresets(readStoredJson(BG_CUSTOM_PRESETS_KEY));
}

export function loadBackgroundStudios(activeStyle: AppBackgroundStyle): BackgroundStudios {
  if (typeof window === 'undefined') return defaultStudios();
  const stored = readStoredJson(BG_STUDIOS_STORAGE_KEY);
  if (stored) return normalizeStudios(stored);
  const migrated = migrateLegacyStudios({
    legacyShard: readStoredJson(BG_STUDIO_STORAGE_KEY),
    legacyTune: readStoredJson(BG_TUNE_STORAGE_KEY),
    activeStyle,
  });
  persistStudios(migrated);
  return migrated;
}

export function resolveIsDark(theme: AppTheme): boolean {
  if (typeof window === 'undefined') return false;
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function applyThemeToHtml(theme: AppTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  const isDark = resolveIsDark(theme);

  if (isDark) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  root.style.colorScheme = isDark ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', isDark ? '#121214' : '#F7F7F8');
}

type AppThemeContextValue = {
  theme: AppTheme;
  setTheme: (newTheme: AppTheme) => void;
  toggleTheme: () => void;
  backgroundStyle: AppBackgroundStyle;
  setBackgroundStyle: (newStyle: AppBackgroundStyle) => void;
  backgroundStudios: BackgroundStudios;
  setBackgroundStudio: (style: DynamicBackgroundStyle, patch: Partial<StudioValues>) => void;
  resetBackgroundStudio: (style: DynamicBackgroundStyle) => void;
  applyBackgroundPreset: (style: DynamicBackgroundStyle, presetId: string) => void;
  customPresets: CustomStudioPresetMap;
  saveCustomPreset: (style: DynamicBackgroundStyle, label: string) => void;
  deleteCustomPreset: (style: DynamicBackgroundStyle, id: string) => void;
  isDark: boolean;
};

const AppThemeContext = createContext<AppThemeContextValue | null>(null);

function useAppThemeState(): AppThemeContextValue {
  const [theme, setThemeState] = useState<AppTheme>(getInitialTheme);
  const [backgroundStyle, setBackgroundStyleState] = useState<AppBackgroundStyle>(getInitialBackgroundStyle);
  const [backgroundStudios, setBackgroundStudiosState] = useState<BackgroundStudios>(() =>
    loadBackgroundStudios(getInitialBackgroundStyle()),
  );
  const [customPresets, setCustomPresets] = useState<CustomStudioPresetMap>(loadCustomPresets);
  const [isDark, setIsDark] = useState(() => resolveIsDark(getInitialTheme()));

  useEffect(() => {
    applyThemeToHtml(theme);
    setIsDark(resolveIsDark(theme));

    if (theme === 'system') {
      const media = window.matchMedia('(prefers-color-scheme: dark)');
      const listener = () => {
        applyThemeToHtml('system');
        setIsDark(resolveIsDark('system'));
      };
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
  }, [theme]);

  const setTheme = useCallback((newTheme: AppTheme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // ignore
    }
    applyThemeToHtml(newTheme);
    setIsDark(resolveIsDark(newTheme));
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolveIsDark(theme) ? 'light' : 'dark');
  }, [setTheme, theme]);

  const setBackgroundStyle = useCallback((newStyle: AppBackgroundStyle) => {
    setBackgroundStyleState(newStyle);
    try {
      localStorage.setItem(BG_STORAGE_KEY, newStyle);
    } catch {
      // ignore
    }
  }, []);

  const setBackgroundStudio = useCallback((style: DynamicBackgroundStyle, patch: Partial<StudioValues>) => {
    if (!isDynamicStyle(style)) return;
    setBackgroundStudiosState((prev) => {
      const next: BackgroundStudios = {
        ...prev,
        [style]: normalizeStudio(style, { ...prev[style], ...patch }),
      };
      persistStudios(next);
      return next;
    });
  }, []);

  const resetBackgroundStudio = useCallback((style: DynamicBackgroundStyle) => {
    setBackgroundStudiosState((prev) => {
      const next: BackgroundStudios = { ...prev, [style]: defaultStudio(style) };
      persistStudios(next);
      return next;
    });
  }, []);

  const applyBackgroundPreset = useCallback((style: DynamicBackgroundStyle, presetId: string) => {
    const preset = getStudioSchema(style)?.presets.find((item) => item.id === presetId);
    if (!preset) return;
    setBackgroundStudio(style, preset.values);
  }, [setBackgroundStudio]);

  const saveCustomPreset = useCallback((style: DynamicBackgroundStyle, label: string) => {
    const values = backgroundStudios[style];
    setCustomPresets((prev) => {
      if (prev[style].length >= CUSTOM_PRESET_LIMIT) return prev;
      const next: CustomStudioPresetMap = {
        ...prev,
        [style]: [...prev[style], createCustomPreset(style, label, values)],
      };
      persistCustomPresets(next);
      return next;
    });
  }, [backgroundStudios]);

  const deleteCustomPreset = useCallback((style: DynamicBackgroundStyle, id: string) => {
    setCustomPresets((prev) => {
      const next: CustomStudioPresetMap = {
        ...prev,
        [style]: prev[style].filter((preset) => preset.id !== id),
      };
      persistCustomPresets(next);
      return next;
    });
  }, []);

  return useMemo(
    () => ({
      theme,
      setTheme,
      toggleTheme,
      backgroundStyle,
      setBackgroundStyle,
      backgroundStudios,
      setBackgroundStudio,
      resetBackgroundStudio,
      applyBackgroundPreset,
      customPresets,
      saveCustomPreset,
      deleteCustomPreset,
      isDark,
    }),
    [
      theme,
      setTheme,
      toggleTheme,
      backgroundStyle,
      setBackgroundStyle,
      backgroundStudios,
      setBackgroundStudio,
      resetBackgroundStudio,
      applyBackgroundPreset,
      customPresets,
      saveCustomPreset,
      deleteCustomPreset,
      isDark,
    ],
  );
}

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const value = useAppThemeState();
  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>;
}

export function useAppTheme(): AppThemeContextValue {
  const ctx = useContext(AppThemeContext);
  if (!ctx) {
    throw new Error('useAppTheme must be used within AppThemeProvider');
  }
  return ctx;
}
