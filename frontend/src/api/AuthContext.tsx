import React, { createContext, useContext, useState, useCallback } from 'react';
import client from './client';
import type { User } from '../types';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
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

  const login = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await client.post('/auth/login', { email, password });
      const t = res.data.accessToken;
      localStorage.setItem('token', t);
      setToken(t);
      setUser(decodeToken(t));
    } finally {
      setLoading(false);
    }
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    setLoading(true);
    try {
      const res = await client.post('/auth/register', { email, password });
      const t = res.data.accessToken;
      localStorage.setItem('token', t);
      setToken(t);
      setUser(decodeToken(t));
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
