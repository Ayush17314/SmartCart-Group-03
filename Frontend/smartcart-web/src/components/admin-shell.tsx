"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { BarChart3, Bell, ClipboardList, Package, Shield, ShoppingCart, TicketPercent, UserRound, Users, ChartNoAxesCombined, Settings, MessageSquareWarning } from "lucide-react";
import type { Permission, User } from "@/lib/types";

const navigation: { label: string; href: string; permission: Permission; icon: typeof BarChart3 }[] = [
  { label: "Overview", href: "/admin", permission: "analytics.read", icon: BarChart3 },
  { label: "Reports", href: "/admin/reports", permission: "analytics.read", icon: ChartNoAxesCombined },
  { label: "Products", href: "/admin/products", permission: "products.write", icon: Package },
  { label: "Orders", href: "/admin/orders", permission: "orders.read_all", icon: ShoppingCart },
  { label: "Promotions", href: "/admin/promotions", permission: "promotions.manage", icon: TicketPercent },
  { label: "Reviews", href: "/admin/reviews", permission: "reviews.moderate", icon: MessageSquareWarning },
  { label: "Store settings", href: "/admin/settings", permission: "settings.manage", icon: Settings },
  { label: "Customers", href: "/admin/customers", permission: "customers.read", icon: UserRound },
  { label: "Staff access", href: "/admin/staff", permission: "staff.read", icon: Users },
  { label: "Audit log", href: "/admin/audit", permission: "audit.read", icon: ClipboardList },
  { label: "Notifications", href: "/admin/notifications", permission: "notifications.manage", icon: Bell },
];

export function AdminShell({ children, permission }: { children: React.ReactNode; permission: Permission }) {
  const router = useRouter();
  const pathname = usePathname();
  const session = useQuery({
    queryKey: ["admin-session"],
    queryFn: async () => {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not verify your session.");
      return response.json() as Promise<{ authenticated: boolean; user?: User }>;
    },
    retry: false,
  });

  useEffect(() => {
    if (!session.isLoading && !session.data?.authenticated) {
      const portal = pathname.startsWith("/super-admin/") ? "super_admin" : "staff";
      router.replace(`/login?portal=${portal}&next=${encodeURIComponent(pathname)}`);
    }
  }, [session.data?.authenticated, session.isLoading, pathname, router]);

  if (session.isLoading) return <div className="mx-auto max-w-6xl px-5 py-16"><div className="skeleton h-12 rounded-2xl"/><div className="skeleton mt-8 h-80 rounded-3xl"/></div>;
  if (session.isError) return <div role="alert" className="mx-auto max-w-xl px-5 py-24 text-center"><h1 className="font-display text-3xl">Unable to verify your session</h1><p className="mt-3 text-sm text-ink/60">Please check your internet connection and try again.</p><button className="mt-5 underline" onClick={() => void session.refetch()}>Try again</button></div>;
  if (!session.data?.authenticated || !session.data.user) return <div className="mx-auto max-w-xl px-5 py-24 text-center"><Shield className="mx-auto mb-4 text-ink/40"/><h1 className="font-display text-3xl">Please sign in to continue</h1><p className="mt-3 text-sm text-ink/60">Your session has expired. Sign in again to access the dashboard.</p></div>;
  if (!session.data.user.permissions?.includes(permission)) return <div className="mx-auto max-w-xl px-5 py-24 text-center"><Shield className="mx-auto mb-4 text-ink/40"/><h1 className="font-display text-3xl">Access restricted</h1><p className="mt-3 text-sm text-ink/60">Your account does not have permission to view this section.</p><Link className="mt-6 inline-block underline" href="/">Return to store</Link></div>;

  const user = session.data.user;
  if (pathname.startsWith("/super-admin/") && user.role !== "super_admin") return <div role="alert" className="mx-auto max-w-xl px-5 py-24 text-center"><Shield className="mx-auto mb-4 text-ink/40"/><h1 className="font-display text-3xl">Administrator access required</h1><p className="mt-3 text-sm text-ink/60">This area is restricted to system administrators.</p><Link className="mt-6 inline-block underline" href="/">Return to store</Link></div>;
  if (pathname.startsWith("/admin/") || pathname === "/admin") {
    if (user.role === "customer") return <div role="alert" className="mx-auto max-w-xl px-5 py-24 text-center"><Shield className="mx-auto mb-4 text-ink/40"/><h1 className="font-display text-3xl">Staff access required</h1><p className="mt-3 text-sm text-ink/60">Customer accounts cannot access the store management dashboard.</p><Link className="mt-6 inline-block underline" href="/">Return to store</Link></div>;
  }
  return <div className="mx-auto grid min-h-[75vh] max-w-[1440px] gap-8 px-5 py-8 md:grid-cols-[220px_1fr] md:px-8 md:py-12">
    <aside className="h-fit rounded-3xl border border-ink/10 p-4">
      <p className="px-3 pb-4 pt-2 text-xs uppercase tracking-[.18em] text-ink/45">Store operations</p>
      <nav className="space-y-1" aria-label="Admin navigation">
        {navigation.filter((item) => user.permissions?.includes(item.permission)).map(({ label, href, icon: Icon }) => <Link key={href} href={href} aria-current={pathname === href ? "page" : undefined} className={`flex items-center gap-3 rounded-xl px-3 py-3 text-sm ${pathname === href ? "bg-ink text-white" : "text-ink/65 hover:bg-sand"}`}><Icon size={17}/>{label}</Link>)}
      </nav>
      <div className="mt-6 border-t border-ink/10 px-3 pt-4"><p className="truncate text-sm font-medium">{user.name}</p><p className="mt-1 text-xs capitalize text-ink/50">{user.role.replaceAll("_", " ")}</p><div className="mt-4 flex flex-col gap-2"><Link href="/account" className="text-xs font-medium text-emerald-800 hover:underline">Profile & addresses</Link><button className="w-fit text-xs text-ink/55 underline" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); const portal = user.role === "super_admin" ? "super_admin" : "staff"; router.replace(`/login?portal=${portal}`); router.refresh(); }}>Sign out</button></div></div>
    </aside>
    <main className="min-w-0">{children}</main>
  </div>;
}
