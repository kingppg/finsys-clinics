import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  ReactNode,
} from 'react';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import '@fontsource/inter/700.css';
import { DcTheme, DEFAULT_THEME_ID, getTheme, THEMES } from './index';

// ============================================================================
// DcThemeProvider — scoped theming
// ----------------------------------------------------------------------------
// Renders a wrapper <div class="dc-scope" data-dc-theme="..."> that carries all
// --dc-* CSS variables, so theming applies ONLY to the subtree it wraps (the
// Billing module today; more modules later). The selected theme id persists in
// localStorage, ready for the Clinic Config theme picker.
// ============================================================================

const STORAGE_KEY = 'dc-theme-id';

interface DcThemeContextValue {
  theme: DcTheme;
  themeId: string;
  setThemeId: (id: string) => void;
  availableThemes: DcTheme[];
}

const DcThemeContext = createContext<DcThemeContextValue | null>(null);

function tokensToCssVars(theme: DcTheme): React.CSSProperties {
  const t = theme.tokens;
  return {
    '--dc-bg': t.bg,
    '--dc-surface': t.surface,
    '--dc-surface-2': t.surface2,
    '--dc-elevated': t.elevated,
    '--dc-border': t.border,
    '--dc-border-strong': t.borderStrong,
    '--dc-text': t.text,
    '--dc-text-2': t.text2,
    '--dc-text-3': t.text3,
    '--dc-accent': t.accent,
    '--dc-accent-hover': t.accentHover,
    '--dc-accent-contrast': t.accentContrast,
    '--dc-accent-soft': t.accentSoft,
    '--dc-success': t.success,
    '--dc-success-soft': t.successSoft,
    '--dc-warning': t.warning,
    '--dc-warning-soft': t.warningSoft,
    '--dc-danger': t.danger,
    '--dc-danger-soft': t.dangerSoft,
    '--dc-info': t.info,
    '--dc-info-soft': t.infoSoft,
    '--dc-shadow': t.shadow,
    '--dc-radius': t.radius,
    '--dc-font': t.font,
    color: t.text,
    fontFamily: t.font,
  } as React.CSSProperties;
}

export function DcThemeProvider({ children }: { children: ReactNode }) {
  const [themeId, setThemeIdState] = useState<string>(() => {
    try {
      return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME_ID;
    } catch {
      return DEFAULT_THEME_ID;
    }
  });

  const setThemeId = useCallback((id: string) => {
    setThemeIdState(THEMES[id] ? id : DEFAULT_THEME_ID);
    try {
      window.localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* storage unavailable — theme still applies for the session */
    }
  }, []);

  const theme = getTheme(themeId);

  const value = useMemo<DcThemeContextValue>(
    () => ({ theme, themeId: theme.id, setThemeId, availableThemes: Object.values(THEMES) }),
    [theme, setThemeId]
  );

  return (
    <DcThemeContext.Provider value={value}>
      <div className="dc-scope" data-dc-theme={theme.id} style={tokensToCssVars(theme)}>
        {children}
      </div>
    </DcThemeContext.Provider>
  );
}

export function useDcTheme(): DcThemeContextValue {
  const ctx = useContext(DcThemeContext);
  if (!ctx) {
    throw new Error('useDcTheme must be used inside <DcThemeProvider>');
  }
  return ctx;
}
