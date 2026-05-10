import React, { createContext, useCallback, useContext, useState } from 'react';
import client from './client';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  exchangeOAuthCode: (code: string) => Promise<void>;
  completeOAuthEmail: (
    ticket: string,
    email: string,
  ) => Promise<{ exchangeCode: string; returnTo: string }>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>(null!);

function decodeToken(token: string): User | null {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return { id: payload.sub, email: payload.email || '', role: payload.role };
  } catch {
    return null;
  }
}

function loadStoredAuth(): { token: string | null; user: User | null } {
  const t = localStorage.getItem('token');
  if (!t) return { token: null, user: null };
  const u = decodeToken(t);
  if (!u) {
    localStorage.removeItem('token');
    return { token: null, user: null };
  }
  return { token: t, user: u };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [stored] = useState(loadStoredAuth);
  const [token, setToken] = useState<string | null>(stored.token);
  const [user, setUser] = useState<User | null>(stored.user);
  const [loading, setLoading] = useState(false);

  const applyAccessToken = useCallback((accessToken: string) => {
    localStorage.setItem('token', accessToken);
    setToken(accessToken);
    setUser(decodeToken(accessToken));
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      try {
        const res = await client.post('/auth/login', { email, password });
        applyAccessToken(res.data.accessToken);
      } finally {
        setLoading(false);
      }
    },
    [applyAccessToken],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      setLoading(true);
      try {
        const res = await client.post('/auth/register', { email, password });
        applyAccessToken(res.data.accessToken);
      } finally {
        setLoading(false);
      }
    },
    [applyAccessToken],
  );

  const exchangeOAuthCode = useCallback(
    async (code: string) => {
      setLoading(true);
      try {
        const res = await client.post('/auth/oauth/exchange', { code });
        applyAccessToken(res.data.accessToken);
      } finally {
        setLoading(false);
      }
    },
    [applyAccessToken],
  );

  const completeOAuthEmail = useCallback(
    async (ticket: string, email: string) => {
      setLoading(true);
      try {
        const res = await client.post('/auth/oauth/complete-email', {
          ticket,
          email,
        });
        return {
          exchangeCode: res.data.exchangeCode as string,
          returnTo: (res.data.returnTo as string) || '/wizard',
        };
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        register,
        exchangeOAuthCode,
        completeOAuthEmail,
        logout,
        loading,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
