'use client';

import { createContext, useContext, useState, useEffect } from 'react';

function readStreamerMode(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem('streamerMode') === 'true';
}

interface StreamerModeContextValue {
  streamerMode: boolean;
  toggleStreamerMode: () => void;
}

const StreamerModeContext = createContext<StreamerModeContextValue>({
  streamerMode: false,
  toggleStreamerMode: () => {},
});

export function StreamerModeProvider({ children }: { children: React.ReactNode }) {
  // Lazy initializer reads localStorage synchronously on the client so the
  // first client render already has the correct value — async-fetched PII
  // (volunteer tables, recipient lists) then paints redacted from the start
  // instead of flashing real data before a post-mount effect flips the flag.
  const [streamerMode, setStreamerMode] = useState(readStreamerMode);

  // Keep other tabs/windows in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'streamerMode') setStreamerMode(e.newValue === 'true');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const toggleStreamerMode = () => {
    setStreamerMode((prev) => {
      const next = !prev;
      localStorage.setItem('streamerMode', String(next));
      return next;
    });
  };

  return (
    <StreamerModeContext.Provider value={{ streamerMode, toggleStreamerMode }}>
      {children}
    </StreamerModeContext.Provider>
  );
}

export function useStreamerMode() {
  return useContext(StreamerModeContext);
}
