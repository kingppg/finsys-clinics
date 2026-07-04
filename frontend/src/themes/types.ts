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

/**
 * Sidebar / side-nav is a distinct themed surface (deliberately its own group
 * so each theme controls the nav independently of the module surfaces —
 * Dark Executive keeps the premium navy gradient; a light theme flips it).
 * Emitted as --dc-nav-* variables.
 */
export interface DcNavTokens {
  /** Gradient top */
  from: string;
  /** Gradient bottom */
  to: string;
  /** Active bar, active label, username, hover border */
  accent: string;
  /** Active nav-item background */
  activeBg: string;
  /** Hover overlay on nav items */
  hoverBg: string;
  /** Bottom (user/logout) section background */
  bottomBg: string;
  /** Dividers / borders */
  border: string;
  /** Logout button background */
  logoutBg: string;
}

export interface DcTheme {
  id: string;
  label: string;
  mode: 'light' | 'dark';
  tokens: DcThemeTokens;
  /** Side-nav surface tokens (emitted as --dc-nav-*) */
  nav: DcNavTokens;
  /** Ordered palette for chart series */
  chartSeries: string[];
  /** 5-step escalation scale used by receivables aging (current → 90+) */
  agingScale: [string, string, string, string, string];
}
