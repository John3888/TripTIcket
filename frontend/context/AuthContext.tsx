/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useCallback,
  useRef,
} from "react";
import { authService } from "@/services/auth.service";
import { ApiError, SESSION_EXPIRED_EVENT } from "@/services/api";
import type { User } from "@/types/trip-ticket";

type AuthContextValue = {
  user: User | null;
  isAuthenticated: boolean;
  isAuthReady: boolean;
  refreshSession: () => Promise<User | null>;
  setAuthenticatedUser: (user: User) => void;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const isAuthenticated = Boolean(user);
  const sessionRevision = useRef(0);

  const refreshSession = useCallback(async () => {
    const revision = sessionRevision.current;
    try {
      const sessionUser = await authService.session();
      if (revision === sessionRevision.current) setUser(sessionUser);
      return sessionUser;
      
    } catch (error) {
      if (
        revision === sessionRevision.current &&
        error instanceof ApiError &&
        error.status === 401
      )
        setUser(null);
      return null;
    } finally {
      setIsAuthReady(true);
    }
  }, []);

  useEffect(() => {
    const expire = () => {
      sessionRevision.current += 1;
      setUser(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, expire);
    void refreshSession();
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, expire);
  }, [refreshSession]);

  useEffect(() => {
    if (!isAuthenticated) return;
    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState === "hidden") return;
      checking = true;
      try {
        await refreshSession();
      } finally {
        checking = false;
      }
    };
    const timer = window.setInterval(() => void check(), 15000);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", check);
    };
  }, [isAuthenticated, refreshSession]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAuthReady,
      refreshSession,
      setAuthenticatedUser: (nextUser) => {
        sessionRevision.current += 1;
        setUser(nextUser);
      },
      signOut: async () => {
        sessionRevision.current += 1;
        setUser(null);
        await authService.logout();
      },
    }),
    [user, isAuthReady, refreshSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
