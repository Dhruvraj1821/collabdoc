import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { getStoredAuth, clearAuth, isLoggedIn } from '../services/authService.js';

interface AuthContextType {
  userId: string | null;
  username: string | null;
  loggedIn: boolean;
  logout: () => void;
  refreshAuth: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  function refreshAuth() {
    const stored = getStoredAuth();
    setUserId(stored.userId);
    setUsername(stored.username);
  }

  function logout() {
    clearAuth();
    setUserId(null);
    setUsername(null);
    window.location.href = '/login';
  }

  useEffect(() => {
    refreshAuth();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        userId,
        username,
        loggedIn: isLoggedIn(),
        logout,
        refreshAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}