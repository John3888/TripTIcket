"use client";

import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { canAccessMenuItem, menuItemForPath } from "@/app/(admin)/config/menu.config";
import { ScreenState } from "@/components/ui/ScreenState";

export function PageAccessGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, isAuthReady } = useAuth();
  const page = menuItemForPath(pathname);

  if (!isAuthReady) {
    return (
      <ScreenState
        kind="loading"
        title="Checking access"
        message="Loading your workspace permissions…"
      />
    );
  }
  if (page && !canAccessMenuItem(user, page)) {
    return (
      <ScreenState
        kind="error"
        title="This page is not available to you"
        message="Your role or department does not have access to this operations page."
      />
    );
  }
  return <>{children}</>;
}
