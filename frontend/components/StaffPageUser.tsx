"use client";
import { useAuth } from "@/context/AuthContext";
import type { User } from "@/types/trip-ticket";
export function StaffPageUser({ children }: { children: (user: User) => React.ReactNode }) {
  const { user } = useAuth();
  return user ? children(user) : null;
}
