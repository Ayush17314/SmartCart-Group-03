import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { AuthActionForm } from "@/components/auth-action-form";

export const metadata: Metadata = { title: "Verify Email" };

export default function VerifyEmailPage() {
  return (
    <section className="mx-auto max-w-md px-5 py-16">
      <div className="rounded-2xl border border-ink/10 bg-white p-6 shadow-xs sm:p-8 dark:bg-zinc-900">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
          Email Verification
        </h1>
        <div className="my-6">
          <Suspense fallback={<div className="skeleton h-20 rounded-2xl" />}>
            <AuthActionForm mode="verify" />
          </Suspense>
        </div>
        <Link href="/login" className="inline-block text-xs font-semibold text-emerald-700 hover:underline">
          Continue to Sign In →
        </Link>
      </div>
    </section>
  );
}
