import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { App as AntApp, ConfigProvider, theme as antTheme } from 'antd';

const ThemeContext = createContext(null);
const KEY = 'jobcopilot.theme';

function initialMode() {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    // Storage blocked: fall back to the system setting.
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export const BRAND = { primary: '#4f46e5', met: '#16a34a', partial: '#d97706', missing: '#dc2626' };

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(initialMode);

  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try {
      localStorage.setItem(KEY, mode);
    } catch {
      // Not critical.
    }
  }, [mode]);

  const value = useMemo(() => ({ mode, toggle: () => setMode((m) => (m === 'dark' ? 'light' : 'dark')) }), [mode]);
  const dark = mode === 'dark';

  return (
    <ThemeContext.Provider value={value}>
      <ConfigProvider
        theme={{
          algorithm: dark ? antTheme.darkAlgorithm : antTheme.defaultAlgorithm,
          token: {
            colorPrimary: BRAND.primary,
            colorLink: dark ? '#a5b4fc' : BRAND.primary,
            colorSuccess: BRAND.met,
            colorWarning: BRAND.partial,
            colorError: BRAND.missing,
            fontFamily: "'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif",
            borderRadius: 10,
            colorBgLayout: dark ? '#0d0f1a' : '#f5f6fb',
          },
          components: { Card: { paddingLG: 20 } },
        }}
      >
        <AntApp>{children}</AntApp>
      </ConfigProvider>
    </ThemeContext.Provider>
  );
}

export function useThemeMode() {
  return useContext(ThemeContext);
}
