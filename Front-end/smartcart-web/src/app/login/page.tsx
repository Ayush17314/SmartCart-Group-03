import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginPortal } from "@/components/login-portal";
import { CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Sign In" };

export default function LoginPage() {
  return (
    <section className="mx-auto grid min-h-[76vh] max-w-5xl items-center gap-10 px-5 py-10 md:grid-cols-[1fr_1fr] md:gap-14 md:px-8 md:py-14">
      <div className="hidden rounded-3xl border border-ink/10 bg-sand/40 p-10 md:flex md:flex-col md:justify-between md:min-h-[520px]">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            SmartCart Account
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
            Everything you need for a smoother shopping experience
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink/65">
            Sign in to view real-time delivery updates, manage your saved addresses, and access your order history anytime.
          </p>
        </div>

        <ul className="space-y-3.5 border-t border-ink/10 pt-6 text-sm text-ink/75">
          <li className="flex items-center gap-2.5">
            <CheckCircle2 size={17} className="text-emerald-700 shrink-0" />
            <span>Track active shipments and delivery status</span>
          </li>
          <li className="flex items-center gap-2.5">
            <CheckCircle2 size={17} className="text-emerald-700 shrink-0" />
            <span>Save items to your wishlist across devices</span>
          </li>
          <li className="flex items-center gap-2.5">
            <CheckCircle2 size={17} className="text-emerald-700 shrink-0" />
            <span>Easy 7-day returns and instant support</span>
          </li>
        </ul>
      </div>

      <div className="mx-auto w-full max-w-md rounded-2xl border border-ink/10 bg-white p-6 shadow-xs sm:p-8 dark:bg-zinc-900">
        <Suspense fallback={<div className="skeleton h-96 rounded-2xl" />}>
          <LoginPortal />
        </Suspense>
      </div>
    </section>
  );
}
