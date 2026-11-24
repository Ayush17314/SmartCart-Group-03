import type { Metadata } from "next";
import Link from "next/link";
import { AuthActionForm } from "@/components/auth-action-form";

export const metadata: Metadata = { title: "Verify Email" };

export default function ResendVerificationPage() {
  return (
    <section className="mx-auto max-w-md px-5 py-16">
      <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-xs sm:p-8 dark:bg-zinc-900">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Verify your email
        </h1>
        <p className="mb-6 mt-2 text-sm text-ink/60">
          Enter your email address below and we&apos;ll send you a new verification link.
        </p>
        <AuthActionForm mode="resend" />
        <div className="mt-6 text-center text-xs text-ink/60">
          <Link href="/login" className="font-semibold text-emerald-700 hover:underline">
            ← Back to sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
