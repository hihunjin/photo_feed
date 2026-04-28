import React, { useEffect, useState } from 'react';

const STORAGE_KEY = 'photo-feed-theme';

function getSystemPreference() {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode) {
  const resolved = mode === 'auto' ? getSystemPreference() : mode;
  document.documentElement.setAttribute('data-theme', resolved);
}

export default function ThemeToggle() {
  const [mode, setMode] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved || 'light';
  });

  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  // Listen for system theme changes when in auto mode
  useEffect(() => {
    if (mode !== 'auto') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyTheme('auto');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  return (
    <div className="theme-toggle" title="Theme">
      <button
        className={mode === 'light' ? 'active' : ''}
        onClick={() => setMode('light')}
        aria-label="Light mode"
      >
        ☀️
      </button>
      <button
        className={mode === 'dark' ? 'active' : ''}
        onClick={() => setMode('dark')}
        aria-label="Dark mode"
      >
        🌙
      </button>
      <button
        className={mode === 'auto' ? 'active' : ''}
        onClick={() => setMode('auto')}
        aria-label="Auto mode"
      >
        💻
      </button>
    </div>
  );
}
