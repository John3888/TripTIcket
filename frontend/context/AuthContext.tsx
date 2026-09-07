/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { authService } from "@/services/auth.service";
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

  const refreshSession = async () => {
    try {
      const sessionUser = await authService.session();
      setUser(sessionUser);
      return sessionUser;
    } catch {
      setUser(null);
      return null;
    } finally {
      setIsAuthReady(true);
    }
  };

  useEffect(() => {
    void refreshSession();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isAuthReady,
      refreshSession,
      setAuthenticatedUser: setUser,
      signOut: async () => {
        try {
          await authService.logout();
        } finally {
          setUser(null);
        }
      },
    }),
    [user, isAuthReady],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider.");
  return context;
}
