import { DcTheme } from './types';

// ============================================================================
// DARK EXECUTIVE — flagship theme
// Deep navy canvas, clinical teal accent. Professional, conservative,
// healthcare-calm. Designed for a dental practice back office.
// ============================================================================

export const darkExecutive: DcTheme = {
  id: 'dark-executive',
  label: 'Dark Executive',
  mode: 'dark',
  tokens: {
    bg: '#0B1120',
    surface: '#131C2E',
    surface2: '#1A2438',
    elevated: '#1F2B42',

    border: 'rgba(148, 163, 184, 0.16)',
    borderStrong: 'rgba(148, 163, 184, 0.32)',

    text: '#EDF2FA',
    text2: '#A9B7CE',
    text3: '#6E7E98',

    accent: '#2DD4BF',
    accentHover: '#14B8A6',
    accentContrast: '#06201C',
    accentSoft: 'rgba(45, 212, 191, 0.13)',

    success: '#4ADE80',
    successSoft: 'rgba(74, 222, 128, 0.13)',
    warning: '#FBBF24',
    warningSoft: 'rgba(251, 191, 36, 0.13)',
    danger: '#F87171',
    dangerSoft: 'rgba(248, 113, 113, 0.14)',
    info: '#60A5FA',
    infoSoft: 'rgba(96, 165, 250, 0.13)',

    shadow: '0 16px 40px rgba(2, 6, 17, 0.5)',
    radius: '12px',
    font: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
  },
  // Sidebar harmonized into the Dark Executive material: same deep-navy family
  // as the canvas (#0B1120) — a subtle vertical gradient so the rail reads as
  // an elevated panel — with the accent UNIFIED to the app's teal (was a
  // clashing cyan). One place controls the whole nav per theme.
  nav: {
    from: '#16233C',
    to: '#0D1422',
    accent: '#2DD4BF',
    activeBg: 'rgba(45, 212, 191, 0.14)',
    hoverBg: 'rgba(148, 163, 184, 0.10)',
    bottomBg: '#0D1524',
    border: 'rgba(148, 163, 184, 0.14)',
    logoutBg: 'transparent',
  },
  chartSeries: ['#2DD4BF', '#60A5FA', '#4ADE80', '#FBBF24', '#F87171', '#A78BFA'],
  agingScale: ['#60A5FA', '#FBBF24', '#FB923C', '#F87171', '#EF4444'],
};
