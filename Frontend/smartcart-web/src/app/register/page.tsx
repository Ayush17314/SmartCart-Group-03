import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";
import { CheckCircle2 } from "lucide-react";

export const metadata: Metadata = { title: "Create Account" };

export default function RegisterPage() {
  return (
    <section className="mx-auto grid min-h-[75vh] max-w-5xl items-center gap-10 px-5 py-10 md:grid-cols-2 md:gap-14 md:px-8">
      <div className="mx-auto w-full max-w-md rounded-2xl border border-ink/10 bg-white p-6 shadow-xs sm:p-8 dark:bg-zinc-900">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
          Create your account
        </h1>
        <p className="mb-6 mt-1.5 text-sm text-ink/60">
          Sign up in seconds to start shopping, track orders, and save your favorite items.
        </p>
        <Suspense fallback={<div className="skeleton h-80 rounded-2xl" />}>
          <AuthForm mode="register" />
        </Suspense>
      </div>

      <div className="hidden rounded-3xl border border-ink/10 bg-sand/40 p-10 md:flex md:flex-col md:justify-between md:min-h-[480px]">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Member Benefits
          </span>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-ink">
            Fast checkout, order tracking, and exclusive deals
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-ink/65">
            Join thousands of shoppers getting quality electronics, fashion, and home essentials delivered right to their door.
          </p>
        </div>

        <ul className="space-y-3.5 border-t border-ink/10 pt-6 text-sm text-ink/75">
          <li className="flex items-center gap-2.5">
            <CheckCircle2 size={17} className="text-emerald-700 shrink-0" />
            <span>10% off your first order with code WELCOME10</span>
          </li>
          <li className="flex items-center gap-2.5">
            <CheckCircle2 size={17} className="text-emerald-700 shrink-0" />
            <span>Free express shipping on orders over ₹499</span>
          </li>
          <li className="flex items-center gap-2.5">
            <CheckCircle2 size={17} className="text-emerald-700 shrink-0" />
            <span>Hassle-free 7-day replacements and returns</span>
          </li>
        </ul>
      </div>
    </section>
  );
}
