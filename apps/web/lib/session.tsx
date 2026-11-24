'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { api, clearSession, saveSession } from './api';

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  mfaEnabled: boolean;
  roles: string[];
  seller: { type: string; storeName: string; verification: string; ratingAvg: number; ratingCount: number } | null;
}

const SessionContext = createContext<{
  user: SessionUser | null;
  ready: boolean;
  refresh: () => Promise<void>;
  setFromAuth: (payload: { accessToken: string; user: SessionUser }) => void;
  logout: () => Promise<void>;
} | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  async function refresh() {
    const hasToken = sessionStorage.getItem('n9.access');
    try {
      const me = await api<{ user: SessionUser | null }>('/auth/me');
      if (me.user) {
        setUser(me.user);
        return;
      }
    } catch {
      // Fall through to the refresh token when the access token has expired.
    }
    if (!hasToken) {
      setUser(null);
      return;
    }
    try {
      const refreshed = await api<{ accessToken: string; user: SessionUser }>('/auth/refresh', { method: 'POST', body: {} });
      saveSession(refreshed.accessToken);
      setUser(refreshed.user);
    } catch {
      clearSession();
      setUser(null);
    }
  }

  useEffect(() => {
    refresh().finally(() => setReady(true));
  }, []);

  return (
    <SessionContext.Provider
      value={{
        user,
        ready,
        refresh,
        setFromAuth(payload) {
          saveSession(payload.accessToken);
          setUser(payload.user);
        },
        async logout() {
          await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
          clearSession();
          setUser(null);
        },
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error('Session missing');
  return value;
}
