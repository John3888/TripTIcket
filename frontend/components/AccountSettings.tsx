"use client";

import { useState } from "react";
import { accountService } from "@/services/account.service";
import { useAuth } from "@/context/AuthContext";

export function AccountSettings() {
  const { user, refreshSession } = useAuth();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setMessage("");
    setError("");
    try {
      await accountService.email(String(form.get("email")));
      await accountService.notifications(
        String(form.get("notificationMode")) as "on" | "silent" | "off",
      );
      const currentPassword = String(form.get("currentPassword"));
      const newPassword = String(form.get("newPassword"));
      if (currentPassword || newPassword) {
        if (!currentPassword || !newPassword)
          throw new Error("Enter both your current and new password.");
        await accountService.password(currentPassword, newPassword);
      }
      await refreshSession();
      setMessage("Your account settings have been saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Settings could not be saved.");
    }
  };
  return (
    <section className="settings-panel settings-panel-single">
      <form onSubmit={save}>
        <div className="settings-head">
          <span>{initials}</span>
          <div>
            <p className="eyebrow">ACCOUNT & SECURITY</p>
            <h2>{user.name}</h2>
            <p>
              {user.role} · {user.employeeId}
            </p>
          </div>
        </div>
        <div className="settings-grid">
          <label>
            <span>Email address</span>
            <input name="email" type="email" required defaultValue={user.email} />
          </label>
          <label>
            <span>Notifications</span>
            <select name="notificationMode" defaultValue={user.notificationMode || "on"}>
              <option value="on">On</option>
              <option value="silent">Silent</option>
              <option value="off">Off</option>
            </select>
          </label>
          <label>
            <span>Current password</span>
            <input name="currentPassword" type="password" autoComplete="current-password" />
          </label>
          <label>
            <span>New password</span>
            <input name="newPassword" type="password" autoComplete="new-password" />
          </label>
        </div>
        <p className="settings-help">
          Leave the password fields empty unless you want to update your password. Your report and
          receipt tools remain available from trip-ticket workspaces.
        </p>
        {message && (
          <p className="settings-message" role="status">
            {message}
          </p>
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <button className="btn primary">Save changes</button>
        </footer>
      </form>
    </section>
  );
}
