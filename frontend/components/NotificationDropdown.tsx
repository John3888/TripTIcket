/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
"use client";

import Link from "next/link";
import { CheckCheck, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { notificationService } from "@/services/notification.service";
import { ticketService } from "@/services/ticket.service";
import type { StoreNotification, User } from "@/types/trip-ticket";

export function NotificationDropdown({
  open,
  user,
  onClose,
  onUnreadChange,
}: {
  open: boolean;
  user: User;
  onClose: () => void;
  onUnreadChange: (count: number) => void;
}) {
  const [notifications, setNotifications] = useState<StoreNotification[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  const relevant = (items: StoreNotification[]) =>
    items.filter(
      (item) => item.recipients.includes(user.role) && !item.closedBy.includes(user.userId),
    );
  const refresh = async () => {
    setLoading(true);
    setError("");
    try {
      const store = await ticketService.store();
      const items = relevant(store.notifications);
      setNotifications(items);
      onUnreadChange(items.filter((item) => !item.readBy.includes(user.userId)).length);
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Notifications could not be loaded.");
      return false;
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    if (open) void refresh();
  }, [open]);
  useEffect(() => {
    if (open) closeButtonRef.current?.focus();
  }, [open]);

  const apply = async (operation: () => Promise<{ notifications: StoreNotification[] }>) => {
    setBusy(true);
    setError("");
    try {
      const store = await operation();
      const items = relevant(store.notifications);
      setNotifications(items);
      onUnreadChange(items.filter((item) => !item.readBy.includes(user.userId)).length);
    } catch (reason) {
      // A notification can disappear after this view was loaded. Reconcile
      // with the store so a stale row never remains as a broken action.
      const refreshed = await refresh();
      if (!refreshed)
        setError(
          reason instanceof Error ? reason.message : "Notification action could not be completed.",
        );
    } finally {
      setBusy(false);
    }
  };
  if (!open) return null;
  return (
    <section
      className="notification-menu"
      role="dialog"
      aria-modal="false"
      aria-labelledby="notification-menu-title"
    >
      <header>
        <div>
          <p className="eyebrow">INBOX</p>
          <h2 id="notification-menu-title">Notifications</h2>
        </div>
        <button ref={closeButtonRef} onClick={onClose} aria-label="Close notifications">
          <X />
        </button>
      </header>
      <div className="notification-actions">
        <button
          disabled={busy || !notifications.length}
          onClick={() => apply(() => notificationService.updateAll("read"))}
        >
          <CheckCheck /> Mark all read
        </button>
        {notifications.length > 0 && (
          <button disabled={busy} onClick={() => apply(() => notificationService.clear())}>
            Dismiss all
          </button>
        )}
      </div>
      <div className="notification-list">
        {error && (
          <div className="notification-error" role="alert">
            <p>{error}</p>
            <button onClick={() => void refresh()} disabled={loading}>
              Retry
            </button>
          </div>
        )}
        {loading && !notifications.length ? (
          <p className="notification-empty" role="status">
            Loading notifications…
          </p>
        ) : notifications.length ? (
          notifications.map((item) => {
            const unread = !item.readBy.includes(user.userId);
            return (
              <article key={item.id} className={unread ? "unread" : ""}>
                <button
                  className="notification-copy"
                  onClick={() => apply(() => notificationService.update(item.id, "read"))}
                >
                  <span className="notification-dot" aria-hidden="true" />
                  <span>
                    <b>{item.title}</b>
                    <small>{item.body}</small>
                    <time>{formatTime(item.createdAt)}</time>
                  </span>
                </button>
                <div className="notification-bottom">
                  {item.ticketId && (
                    <Link href="/pending" onClick={onClose}>
                      Open ticket
                    </Link>
                  )}
                  <button
                    onClick={() => apply(() => notificationService.update(item.id, "close"))}
                    aria-label={`Close ${item.title}`}
                  >
                    <X />
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <p className="notification-empty">You have no active notifications.</p>
        )}
      </div>
    </section>
  );
}
function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf())
    ? "Recently"
    : date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}
