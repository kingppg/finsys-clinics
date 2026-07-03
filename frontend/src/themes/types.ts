// ============================================================================
// THEME SYSTEM — TYPE CONTRACTS
// ----------------------------------------------------------------------------
// Architecture rule: LAYOUT lives in component CSS (spacing, grids, sizes).
// COSMETICS live here as tokens (colors, shadows, radius, font). A theme is a
// plain object; the provider turns tokens into CSS custom properties
// (--dc-*) on a scoped wrapper, so every themed component — legacy CSS or new
// TSX — reads the same variables. Adding a theme = adding one object to the
// registry. The future Clinic Config theme picker just calls setThemeId().
// ============================================================================

export interface DcThemeTokens {
  /** Page/module canvas */
  bg: string;
  /** Card / panel surface */
  surface: string;
  /** Slightly raised surface (table headers, section headers, inputs) */
  surface2: string;
  /** Highest elevation (popovers, dropdowns) */
  elevated: string;

  border: string;
  borderStrong: string;

  text: string;
  text2: string;
  text3: string;

  /** Primary action color */
  accent: string;
  accentHover: string;
  /** Text color placed on top of accent backgrounds */
  accentContrast: string;
  /** Translucent accent wash for chips/selected states */
  accentSoft: string;

  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
  info: string;
  infoSoft: string;

  shadow: string;
  radius: string;
  font: string;
}

export interface DcTheme {
  id: string;
  label: string;
  mode: 'light' | 'dark';
  tokens: DcThemeTokens;
  /** Ordered palette for chart series */
  chartSeries: string[];
  /** 5-step escalation scale used by receivables aging (current → 90+) */
  agingScale: [string, string, string, string, string];
}
