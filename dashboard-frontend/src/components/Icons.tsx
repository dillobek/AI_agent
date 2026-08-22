/**
 * Inline SVG icon set — intentionally dependency-free.
 *
 * Adding an icon library would mean another package to install, audit, and
 * keep patched for what amounts to a few hundred bytes of path data. These
 * are drawn on a 24×24 grid with a 1.75 stroke so they optically match the
 * Inter text weight used throughout the UI.
 */

import type { ReactNode } from 'react';

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

function Svg({
  size = 18,
  className,
  strokeWidth = 1.75,
  children,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
      style={{ flexShrink: 0 }}
    >
      {children}
    </svg>
  );
}

export const IconAgent = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4L7 17M17 7l1.4-1.4" opacity="0.55" />
    <circle cx="12" cy="12" r="4.2" />
    <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconSparkle = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9L12 2.5z" />
    <path d="M18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z" opacity="0.6" />
  </Svg>
);

export const IconActivity = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h3.5l2.5-7 4 14 2.5-7H21" />
  </Svg>
);

export const IconChart = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3v16.5A1.5 1.5 0 004.5 21H21" />
    <path d="M7.5 15.5l3.5-4 3 2.5L20 7" />
  </Svg>
);

export const IconUsers = (p: IconProps) => (
  <Svg {...p}>
    <path d="M16.5 20v-1.6a3.4 3.4 0 00-3.4-3.4H6.9a3.4 3.4 0 00-3.4 3.4V20" />
    <circle cx="10" cy="7.5" r="3.4" />
    <path d="M20.5 20v-1.6a3.4 3.4 0 00-2.6-3.3M15.5 4.3a3.4 3.4 0 010 6.4" opacity="0.6" />
  </Svg>
);

export const IconLogs = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 6h13M8 12h13M8 18h13" />
    <circle cx="3.5" cy="6" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="3.5" cy="12" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="3.5" cy="18" r="1.1" fill="currentColor" stroke="none" />
  </Svg>
);

export const IconSend = (p: IconProps) => (
  <Svg {...p}>
    <path d="M21.5 2.5L11 13" />
    <path d="M21.5 2.5l-6.7 19-3.8-8.5L2.5 9.2l19-6.7z" />
  </Svg>
);

export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20.5 11a8.5 8.5 0 10-2.2 6.2" />
    <path d="M21 4.5V11h-6.5" />
  </Svg>
);

export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9.5 21H5.5A1.5 1.5 0 014 19.5v-15A1.5 1.5 0 015.5 3h4" />
    <path d="M16 16.5l4.5-4.5L16 7.5M20.5 12H9.5" />
  </Svg>
);

export const IconCheck = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 6.5L9.5 17 4 11.5" />
  </Svg>
);

export const IconX = (p: IconProps) => (
  <Svg {...p}>
    <path d="M18 6L6 18M6 6l12 12" />
  </Svg>
);

export const IconAlert = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 3.9L1.9 18a2 2 0 001.7 3h16.8a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
    <path d="M12 9v4.5M12 17.5h.01" />
  </Svg>
);

export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </Svg>
);

export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
  </Svg>
);

export const IconTool = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 2L4.5 12.5h6L11 22l8.5-10.5h-6L13 2z" />
  </Svg>
);

export const IconShield = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 22s8-3.5 8-9.5V5.5L12 2.5 4 5.5v7c0 6 8 9.5 8 9.5z" />
    <path d="M9 12l2 2 4-4" opacity="0.7" />
  </Svg>
);

export const IconCpu = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5" y="5" width="14" height="14" rx="2.5" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
    <path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3" opacity="0.6" />
  </Svg>
);

export const IconClock = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5.2l3.2 1.9" />
  </Svg>
);

export const IconLock = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="10.5" width="16" height="10.5" rx="2" />
    <path d="M8 10.5V7a4 4 0 018 0v3.5" />
  </Svg>
);

export const IconDatabase = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="5.5" rx="8" ry="3.2" />
    <path d="M4 5.5v13c0 1.8 3.6 3.2 8 3.2s8-1.4 8-3.2v-13" />
    <path d="M20 12c0 1.8-3.6 3.2-8 3.2S4 13.8 4 12" opacity="0.6" />
  </Svg>
);

export const IconPlug = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 2v6M15 2v6" />
    <path d="M6 8h12v3a6 6 0 01-6 6 6 6 0 01-6-6V8z" />
    <path d="M12 17v5" />
  </Svg>
);

export const IconMic = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="2.5" width="6" height="12" rx="3" />
    <path d="M5.5 11a6.5 6.5 0 0013 0" />
    <path d="M12 17.5V21M8.5 21h7" />
  </Svg>
);

export const IconMicOff = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 3l18 18" />
    <path d="M9 5a3 3 0 016 0v6c0 .4-.05.78-.15 1.13M15 14.15A3 3 0 019 12V9" opacity="0.85" />
    <path d="M5.5 11a6.5 6.5 0 009.2 5.9M18.5 11a6.47 6.47 0 01-.86 3.24" opacity="0.85" />
    <path d="M12 17.5V21M8.5 21h7" />
  </Svg>
);

/** Indeterminate spinner. `aria-hidden` — pair it with visible or SR-only text. */
export const IconSpinner = ({ size = 16, className }: IconProps) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    className={className}
    aria-hidden="true"
    style={{ animation: 'spin 0.7s linear infinite', flexShrink: 0 }}
  >
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" />
    <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  </svg>
);
