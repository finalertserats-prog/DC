import React from 'react';

/* ── Friday professional logo mark ── */
export const LogoMark: React.FC<{ size?: number }> = ({ size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 34 34" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="lmg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#7c3aed" />
      </linearGradient>
      <linearGradient id="lmg2" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#818cf8" />
        <stop offset="100%" stopColor="#a78bfa" />
      </linearGradient>
    </defs>
    <rect width="34" height="34" rx="9" fill="url(#lmg)" />
    {/* SQL / data row bars */}
    <rect x="7" y="10" width="20" height="2.8" rx="1.4" fill="white" />
    <rect x="7" y="15.6" width="13.5" height="2.8" rx="1.4" fill="white" opacity="0.75" />
    <rect x="7" y="21.2" width="17" height="2.8" rx="1.4" fill="white" opacity="0.9" />
    {/* small accent dot */}
    <circle cx="26" cy="22.6" r="2.4" fill="url(#lmg2)" opacity="0.95" />
  </svg>
);

/* ── Full wordmark (icon + text) ── */
export const LogoWordmark: React.FC<{ size?: number; light?: boolean }> = ({ size = 28, light = false }) => (
  <div className="flex items-center gap-2.5 select-none">
    <LogoMark size={size} />
    <span
      className="font-bold tracking-tight"
      style={{
        fontSize: size * 0.62,
        color: light ? 'white' : '#111827',
        letterSpacing: '-0.02em',
        lineHeight: 1,
      }}
    >
      Friday
    </span>
  </div>
);

/* ── Icon-only compact (for collapsed sidebar) ── */
export const LogoIcon: React.FC = () => (
  <svg width="28" height="28" viewBox="0 0 34 34" fill="none">
    <defs>
      <linearGradient id="lig" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6366f1" />
        <stop offset="100%" stopColor="#7c3aed" />
      </linearGradient>
    </defs>
    <rect width="34" height="34" rx="9" fill="url(#lig)" />
    <rect x="7" y="10" width="20" height="2.8" rx="1.4" fill="white" />
    <rect x="7" y="15.6" width="13.5" height="2.8" rx="1.4" fill="white" opacity="0.75" />
    <rect x="7" y="21.2" width="17" height="2.8" rx="1.4" fill="white" opacity="0.9" />
    <circle cx="26" cy="22.6" r="2.4" fill="#a78bfa" opacity="0.95" />
  </svg>
);
