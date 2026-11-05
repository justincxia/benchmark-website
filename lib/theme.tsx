'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';

export interface ThemeTokens {
  bg: string;
  fg: string;
  card: string;
  cardFg: string;
  muted: string;
  mutedFg: string;
  border: string;
  input: string;
  primary: string;
  primaryFg: string;
  secondary: string;
  secondaryFg: string;
  accent: string;
  accentFg: string;
  success: string;
  successBg: string;
  successBorder: string;
  danger: string;
  dangerBg: string;
  dangerBorder: string;
  shadow: string;
}

const lightTheme: ThemeTokens = {
  bg: '#ffffff',
  fg: '#09090b',
  card: '#ffffff',
  cardFg: '#09090b',
  muted: '#f4f4f5',
  mutedFg: '#71717a',
  border: '#e4e4e7',
  input: '#e4e4e7',
  primary: '#18181b',
  primaryFg: '#fafafa',
  secondary: '#f4f4f5',
  secondaryFg: '#18181b',
  accent: '#f4f4f5',
  accentFg: '#18181b',
  success: '#16a34a',
  successBg: 'rgba(22,163,74,0.09)',
  successBorder: 'rgba(22,163,74,0.35)',
  danger: '#dc2626',
  dangerBg: 'rgba(220,38,38,0.09)',
  dangerBorder: 'rgba(220,38,38,0.35)',
  shadow: '0 1px 2px rgba(0,0,0,0.04)',
};

const darkTheme: ThemeTokens = {
  bg: '#09090b',
  fg: '#fafafa',
  card: '#18181b',
  cardFg: '#fafafa',
  muted: '#27272a',
  mutedFg: '#a1a1aa',
  border: '#27272a',
  input: '#27272a',
  primary: '#fafafa',
  primaryFg: '#18181b',
  secondary: '#27272a',
  secondaryFg: '#fafafa',
  accent: '#27272a',
  accentFg: '#fafafa',
  success: '#4ade80',
  successBg: 'rgba(74,222,128,0.14)',
  successBorder: 'rgba(74,222,128,0.45)',
  danger: '#f87171',
  dangerBg: 'rgba(248,113,113,0.14)',
  dangerBorder: 'rgba(248,113,113,0.45)',
  shadow: '0 1px 2px rgba(0,0,0,0.4)',
};

interface ThemeContextValue {
  isDark: boolean;
  setIsDark: (isDark: boolean) => void;
  t: ThemeTokens;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(false);
  const t = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ isDark, setIsDark, t }}>
      <div style={{ minHeight: '100vh', background: t.bg, color: t.fg }}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within a ThemeProvider');
  return ctx;
}
