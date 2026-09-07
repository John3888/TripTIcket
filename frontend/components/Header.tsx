"use client";

import Link from "next/link";
import { Bell, ChevronDown, LogOut, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { departmentLabel, menuItemForPath } from "@/app/(admin)/config/menu.config";
import { useAuth } from "@/context/AuthContext";
import { ticketService } from "@/services/ticket.service";
import { NotificationDropdown } from "./NotificationDropdown";

export function Header() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [profileOpen, setProfileOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const profileRef = useRef<HTMLDivElement>(null);
  const notificationRef = useRef<HTMLDivElement>(null);
  const item = menuItemForPath(pathname);
  const initials = (user?.name || "User")
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  useEffect(() => {
    const closeMenus = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent && event.key !== "Escape") return;
      if (event instanceof MouseEvent) {
        const target = event.target as Node;
        if (profileRef.current?.contains(target) || notificationRef.current?.contains(target))
          return;
      }
      setProfileOpen(false);
      setNotificationsOpen(false);
    };
    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", closeMenus);
    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("keydown", closeMenus);
    };
  }, []);
  useEffect(() => {
    if (!user) return;
    let active = true;
    const refreshUnread = async () => {
      try {
        const store = await ticketService.store();
        if (active)
          setUnreadCount(
            store.notifications.filter(
              (notification) =>
                notification.recipients.includes(user.role) &&
                !notification.closedBy.includes(user.userId) &&
                !notification.readBy.includes(user.userId),
            ).length,
          );
      } catch {
        /* The notification menu exposes the API problem on demand. */
      }
    };
    void refreshUnread();
    const interval = window.setInterval(refreshUnread, 60_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [user]);

  const logout = async () => {
    setProfileOpen(false);
    await signOut();
    router.replace("/");
  };
  if (!user) return null;
  return (
    <header className="console-header">
      <div className="header-title">
        <span className="breadcrumb">OPERATIONS /</span>
        <b>{item?.label || "Workspace"}</b>
      </div>
      <div className="header-actions">
        <div ref={notificationRef} className="header-popover">
          <button
            className="header-icon-button"
            onClick={() => {
              setNotificationsOpen((value) => !value);
              setProfileOpen(false);
            }}
            aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
            aria-expanded={notificationsOpen}
          >
            <Bell />
            {unreadCount > 0 && (
              <span className="notification-count">{unreadCount > 9 ? "9+" : unreadCount}</span>
            )}
          </button>
          <NotificationDropdown
            open={notificationsOpen}
            user={user}
            onClose={() => setNotificationsOpen(false)}
            onUnreadChange={setUnreadCount}
          />
        </div>
        <div className="header-popover" ref={profileRef}>
          <button
            className="profile-trigger"
            onClick={() => {
              setProfileOpen((value) => !value);
              setNotificationsOpen(false);
            }}
            aria-haspopup="menu"
            aria-expanded={profileOpen}
          >
            <span className="profile-avatar">{initials}</span>
            <span className="profile-trigger-copy">
              <b>{user.name}</b>
              <small>
                {user.role} · {departmentLabel(user.department)}
              </small>
            </span>
            <ChevronDown className={profileOpen ? "flipped" : ""} />
          </button>
          {profileOpen && (
            <section className="profile-menu" role="menu">
              <div className="profile-menu-intro">
                <span className="profile-avatar large">{initials}</span>
                <span>
                  <b>{user.name}</b>
                  <small>
                    {user.role} · {departmentLabel(user.department)}
                  </small>
                </span>
              </div>
              <Link href="/settings" role="menuitem" onClick={() => setProfileOpen(false)}>
                <Settings /> Account settings
              </Link>
              <button role="menuitem" onClick={logout}>
                <LogOut /> Sign out
              </button>
            </section>
          )}
        </div>
      </div>
    </header>
  );
}
