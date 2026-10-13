"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export default function AcceptStaffInvitePage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    const rawToken = new URLSearchParams(window.location.hash.slice(1)).get("token") || "";
    setToken(rawToken);
    window.history.replaceState(null, "", window.location.pathname);
  }, []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token) {
      toast.error("Invitation token is missing. Please open the invitation link sent to you.");
      return;
    }
    if (password.length < 8 || password.length > 128) {
      toast.error("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      toast.error("Passwords do not match.");
      return;
    }
    setPending(true);
    try {
      await api.acceptStaffInvite(token, password);
      setComplete(true);
      setToken("");
      toast.success("Account activated! You can now sign in.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not activate account");
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="mx-auto max-w-md px-5 py-16">
      <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-xs sm:p-8 dark:bg-zinc-900">
        <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          Team Onboarding
        </span>
        <h1 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Set up your staff account
        </h1>
        {complete ? (
          <div className="mt-6 rounded-xl bg-emerald-50 p-5 text-sm text-emerald-950">
            <p>Your staff account is active. You can now sign in with your work email and password.</p>
            <Link
              className="mt-4 inline-block font-semibold text-emerald-800 underline"
              href="/login?portal=staff"
            >
              Sign in to Staff Portal →
            </Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-xs font-semibold text-ink/80">
              Create password
              <input
                required
                type="password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                className="field mt-1"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Minimum 8 characters"
              />
            </label>
            <label className="block text-xs font-semibold text-ink/80">
              Confirm password
              <input
                required
                type="password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                className="field mt-1"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                placeholder="Re-enter password"
              />
            </label>
            <Button className="w-full" disabled={pending || !token}>
              {pending ? "Activating..." : "Activate Account"}
            </Button>
            {!token && (
              <p role="alert" className="text-xs text-red-700">
                Invalid or missing invitation token. Please open the full link from your invitation.
              </p>
            )}
          </form>
        )}
      </div>
    </section>
  );
}
