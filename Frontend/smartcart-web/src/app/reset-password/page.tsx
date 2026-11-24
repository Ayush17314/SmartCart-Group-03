import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthActionForm } from "@/components/auth-action-form";

export const metadata: Metadata = { title: "Set New Password" };

export default function ResetPasswordPage() {
  return (
    <section className="mx-auto max-w-md px-5 py-16">
      <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-xs sm:p-8 dark:bg-zinc-900">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Set a new password
        </h1>
        <p className="mb-6 mt-2 text-sm text-ink/60">
          Choose a strong password that you haven&apos;t used before.
        </p>
        <Suspense fallback={<div className="skeleton h-48 rounded-2xl" />}>
          <AuthActionForm mode="reset" />
        </Suspense>
        <div className="mt-6 text-center text-xs text-ink/60">
          <Link href="/login" className="font-semibold text-emerald-700 hover:underline">
            ← Back to sign in
          </Link>
        </div>
      </div>
    </section>
  );
}
