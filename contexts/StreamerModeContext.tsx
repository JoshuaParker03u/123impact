'use client';

import { createContext, useContext, useState, useEffect } from 'react';

interface StreamerModeContextValue {
  streamerMode: boolean;
  toggleStreamerMode: () => void;
}

const StreamerModeContext = createContext<StreamerModeContextValue>({
  streamerMode: false,
  toggleStreamerMode: () => {},
});

export function StreamerModeProvider({ children }: { children: React.ReactNode }) {
  const [streamerMode, setStreamerMode] = useState(false);

  useEffect(() => {
    setStreamerMode(localStorage.getItem('streamerMode') === 'true');
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
