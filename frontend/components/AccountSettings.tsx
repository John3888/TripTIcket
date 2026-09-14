"use client";

import { useState } from "react";
import {
  Bell,
  CheckCircle2,
  LoaderCircle,
  LockKeyhole,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { accountService } from "@/services/account.service";
import { useAuth } from "@/context/AuthContext";

export function AccountSettings() {
  const { user, refreshSession } = useAuth();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  if (!user) return null;
  const initials = user.name
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const save = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setMessage("");
    setError("");
    const currentPassword = String(form.get("currentPassword") || "");
    const newPassword = String(form.get("newPassword") || "");
    if ((currentPassword || newPassword) && (!currentPassword || !newPassword)) {
      setError("Enter both your current and new password before saving.");
      formElement
        .querySelector<HTMLInputElement>(
          `[name="${!currentPassword ? "currentPassword" : "newPassword"}"]`,
        )
        ?.focus();
      return;
    }
    if (newPassword && newPassword.length < 8) {
      setError("Your new password must contain at least 8 characters.");
      formElement.querySelector<HTMLInputElement>('[name="newPassword"]')?.focus();
      return;
    }
    setSaving(true);
    try {
      await accountService.email(String(form.get("email")));
      await accountService.notifications(
        String(form.get("notificationMode")) as "on" | "silent" | "off",
      );
      if (currentPassword || newPassword) {
        await accountService.password(currentPassword, newPassword);
        const passwordFields =
          formElement.querySelectorAll<HTMLInputElement>('input[type="password"]');
        passwordFields.forEach((field) => {
          field.value = "";
        });
      }
      await refreshSession();
      setMessage("Your account settings have been saved.");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <section className="settings-panel settings-panel-single">
      <form onSubmit={save} aria-busy={saving}>
        <div className="settings-head">
          <span>{initials}</span>
          <div>
            <p className="eyebrow">ACCOUNT & SECURITY</p>
            <h2>{user.name}</h2>
            <p>
              {user.role} · {user.employeeId}
            </p>
          </div>
          <div className="settings-security-badge">
            <ShieldCheck size={17} aria-hidden="true" />
            Personal workspace
          </div>
        </div>
        <fieldset className="settings-section" disabled={saving}>
          <legend>
            <UserRound size={20} aria-hidden="true" />
            Profile & preferences
          </legend>
          <p className="settings-section-description">
            Keep your contact details current and choose how you receive updates.
          </p>
          <div className="settings-grid">
            <label>
              <span>Email address</span>
              <input name="email" type="email" required defaultValue={user.email} />
              <small className="field-help">Use an email address you check regularly.</small>
            </label>
            <label>
              <span>
                <Bell size={15} aria-hidden="true" /> Notifications
              </span>
              <select name="notificationMode" defaultValue={user.notificationMode || "on"}>
                <option value="on">On — receive all notifications</option>
                <option value="silent">Silent — without sound</option>
                <option value="off">Off — pause notifications</option>
              </select>
              <small className="field-help">
                Choose the level of interruption that works for you.
              </small>
            </label>
          </div>
        </fieldset>
        <fieldset className="settings-section" disabled={saving}>
          <legend>
            <LockKeyhole size={20} aria-hidden="true" />
            Password & security
          </legend>
          <p className="settings-section-description" id="password-help">
            To change your password, enter both fields below. Leave them empty to keep your current
            password.
          </p>
          <div className="settings-grid">
            <label>
              <span>Current password</span>
              <input
                name="currentPassword"
                type="password"
                autoComplete="current-password"
                aria-describedby="password-help"
                placeholder="Enter current password"
              />
            </label>
            <label>
              <span>New password</span>
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={8}
                aria-describedby="password-help"
                placeholder="At least 8 characters"
              />
            </label>
          </div>
        </fieldset>
        {message && (
          <p className="settings-message" role="status">
            <CheckCircle2 size={18} aria-hidden="true" />
            {message}
          </p>
        )}
        {error && (
          <p className="login-error" role="alert">
            {error}
          </p>
        )}
        <footer>
          <p className="settings-help">Changes apply to your account across the system.</p>
          <button className="btn primary" type="submit" disabled={saving}>
            {saving ? (
              <LoaderCircle size={17} className="spin" aria-hidden="true" />
            ) : (
              <Save size={17} aria-hidden="true" />
            )}
            {saving ? "Saving changes…" : "Save changes"}
          </button>
        </footer>
      </form>
    </section>
  );
}
