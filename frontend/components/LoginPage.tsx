"use client";

import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff, LockKeyhole, ShieldCheck, UserRound } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { authService } from "@/services/auth.service";

export function LoginPage() {
  const router = useRouter();
  const { setAuthenticatedUser } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setLoading(true);
    setError("");
    try {
      const user = await authService.login(
        String(form.get("username")),
        String(form.get("password")),
      );
      setAuthenticatedUser(user);
      router.replace("/pending");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Sign-in was unsuccessful.");
    } finally {
      setLoading(false);
    }
  };
  return (
    <main className="login-page operations-login">
      <section className="login-brand">
        <Image src="/assets/emb-logo.png" width={112} height={112} alt="EMB logo" priority />
        <p className="eyebrow">EMB CAPITAL LENDING CORPORATION</p>
        <h1>
          Trip operations,
          <br />
          in clear view.
        </h1>
        <p>
          One controlled workspace for reviewing travel, tracking active trips, and keeping every
          approval accountable.
        </p>
        <div className="login-seal">
          <ShieldCheck />
          <span>
            <b>Authorized personnel only</b>
            <small>Access and approvals are recorded for operational accountability.</small>
          </span>
        </div>
      </section>
      <section className="login-panel">
        <form onSubmit={submit}>
          <p className="eyebrow">STAFF SIGN IN</p>
          <h2>Welcome back</h2>
          <p>Enter your staff account details to continue.</p>
          <label>
            <span>Email address</span>
            <div className="input-icon">
              <UserRound />
              <input name="username" type="email" required autoComplete="username" />
            </div>
          </label>
          <label>
            <span>Password</span>
            <div className="input-icon">
              <LockKeyhole />
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                required
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </label>
          {error && (
            <p className="login-error" role="alert">
              {error}
            </p>
          )}
          <button disabled={loading} className="btn primary wide">
            {loading ? "Signing you in…" : "Continue to operations"}
          </button>
          <p className="requester-link">
            Need to request a trip? <Link href="/request">Open the employee kiosk</Link>
          </p>
        </form>
      </section>
    </main>
  );
}
