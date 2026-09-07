"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Header } from "@/components/Header";
import { SidebarMenu } from "@/components/SidebarMenu";
import { ScreenState } from "@/components/ui/ScreenState";
import { PageAccessGuard } from "@/components/PageAccessGuard";

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { isAuthenticated, isAuthReady } = useAuth();
  useEffect(() => {
    if (isAuthReady && !isAuthenticated) router.replace("/");
  }, [isAuthReady, isAuthenticated, router]);
  if (!isAuthReady)
    return (
      <ScreenState
        kind="loading"
        title="Preparing your workspace"
        message="Checking your authenticated staff session…"
      />
    );
  if (!isAuthenticated)
    return (
      <ScreenState
        kind="error"
        title="Session required"
        message="Returning you to the sign-in page…"
      />
    );
  return (
    <div className="operations-shell">
      <SidebarMenu />
      <div className="operations-body">
        <Header />
        <main className="operations-main">
          <PageAccessGuard>{children}</PageAccessGuard>
        </main>
      </div>
    </div>
  );
}
