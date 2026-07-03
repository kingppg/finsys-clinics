import React from 'react';

// Minimal inline SVG icons (lucide path data, ISC-licensed) — matching the
// inline-icon pattern used across this codebase. Importing lucide-react's
// barrel file was pulling the entire icon library into the CRA bundle
// (~350 kB gzipped); these six inline icons cost effectively nothing.

interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

function makeIcon(children: React.ReactNode) {
  return function DcIcon({ size = 16, color = 'currentColor', strokeWidth = 2 }: IconProps) {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {children}
      </svg>
    );
  };
}

export const AlertTriangleIcon = makeIcon(
  <>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </>
);

export const CheckCircleIcon = makeIcon(
  <>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <path d="m22 4-10 10.01-3-3" />
  </>
);

export const BanknoteIcon = makeIcon(
  <>
    <rect x="2" y="6" width="20" height="12" rx="2" />
    <circle cx="12" cy="12" r="2" />
    <path d="M6 12h.01M18 12h.01" />
  </>
);

export const WalletIcon = makeIcon(
  <>
    <path d="M21 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-3" />
    <path d="M3 10h18" />
    <path d="M16 14h.01" />
  </>
);

export const HourglassIcon = makeIcon(
  <>
    <path d="M5 22h14" />
    <path d="M5 2h14" />
    <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 18.828V22" />
    <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
  </>
);

export const TrendingUpIcon = makeIcon(
  <>
    <path d="m22 7-8.5 8.5-5-5L2 17" />
    <path d="M16 7h6v6" />
  </>
);
