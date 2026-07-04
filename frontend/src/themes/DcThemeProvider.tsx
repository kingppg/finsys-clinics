import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
    // Side-nav surface (--dc-nav-*)
    '--dc-nav-from': theme.nav.from,
    '--dc-nav-to': theme.nav.to,
    '--dc-nav-accent': theme.nav.accent,
    '--dc-nav-active-bg': theme.nav.activeBg,
    '--dc-nav-hover-bg': theme.nav.hoverBg,
    '--dc-nav-bottom-bg': theme.nav.bottomBg,
    '--dc-nav-border': theme.nav.border,
    '--dc-nav-logout-bg': theme.nav.logoutBg,
    color: t.text,
    fontFamily: t.font,
  } as React.CSSProperties;
}

/**
 * Write only the --dc-* custom properties onto an element (default :root),
 * WITHOUT forcing color/background/font. This makes the whole theme's
 * variables available app-wide (sidebar, calendar, and body-mounted portals
 * like SweetAlert2) while staying inert for modules that don't reference
 * them yet — the safe path for the gradual app-wide theming rollout.
 */
export function applyThemeVars(theme: DcTheme, el: HTMLElement = document.documentElement) {
  const vars = tokensToCssVars(theme);
  Object.entries(vars).forEach(([key, value]) => {
    if (key.startsWith('--')) el.style.setProperty(key, String(value));
  });
  el.setAttribute('data-dc-theme', theme.id);
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

/**
 * DcThemeRoot — app-level theme injector.
 * Writes the active theme's --dc-* variables onto :root (via applyThemeVars)
 * and provides theme context, but renders NO wrapper div and does NOT force
 * global color/background/font. Mount once high in the tree (Dashboard) so the
 * sidebar, calendar, and every migrated module read the same tokens, while
 * un-migrated modules stay exactly as they are. Persists the selection in the
 * same localStorage key as DcThemeProvider, ready for the Clinic Config picker.
 */
export function DcThemeRoot({ children }: { children: ReactNode }) {
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

  useEffect(() => {
    applyThemeVars(theme);
  }, [theme]);

  const value = useMemo<DcThemeContextValue>(
    () => ({ theme, themeId: theme.id, setThemeId, availableThemes: Object.values(THEMES) }),
    [theme, setThemeId]
  );

  return <DcThemeContext.Provider value={value}>{children}</DcThemeContext.Provider>;
}
