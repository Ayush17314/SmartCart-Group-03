"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck, ShoppingBag, Store } from "lucide-react";
import { AuthForm } from "@/components/auth-form";

const portals = [
  {
    id: "customer",
    label: "Customer",
    icon: ShoppingBag,
    heading: "Sign in to your account",
    subtitle: "Access your orders, saved items, and faster checkout.",
  },
  {
    id: "staff",
    label: "Staff / Manager",
    icon: Store,
    heading: "Staff & Manager Sign In",
    subtitle: "Manage orders, inventory, promotions, and customer requests.",
  },
  {
    id: "super_admin",
    label: "Super Admin",
    icon: ShieldCheck,
    heading: "Administrator Sign In",
    subtitle: "Sign in to manage team roles, permissions, and store settings.",
  },
] as const;

type Portal = (typeof portals)[number]["id"];

export function LoginPortal() {
  const params = useSearchParams();
  const initial = params.get("portal");
  const [selected, setSelected] = useState<Portal>(
    initial === "staff" || initial === "super_admin" ? initial : "customer"
  );
  const current = portals.find((portal) => portal.id === selected)!;

  return (
    <div>
      <fieldset className="mb-6">
        <legend className="sr-only">Account type</legend>
        <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-sand/70 p-1">
          {portals.map(({ id, label, icon: Icon }) => (
            <label
              key={id}
              className={`flex cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-2.5 text-center text-xs font-medium transition ${
                selected === id
                  ? "bg-white text-ink shadow-xs dark:bg-zinc-900"
                  : "text-ink/60 hover:text-ink"
              }`}
            >
              <input
                className="sr-only"
                type="radio"
                name="login-portal"
                value={id}
                checked={selected === id}
                onChange={() => setSelected(id)}
              />
              <Icon size={15} aria-hidden="true" className={selected === id ? "text-emerald-700" : ""} />
              <span>{label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">
        {current.heading}
      </h1>
      <p className="mb-6 mt-1.5 text-sm text-ink/60">{current.subtitle}</p>

      <AuthForm key={selected} mode="login" audience={selected} />
    </div>
  );
}
