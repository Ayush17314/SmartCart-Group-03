import Link from "next/link";
import { AdminShell } from "@/components/admin-shell";

const tools = [
  ["Store Operations", "Manage orders, product catalog, inventory, and promotions.", "/admin"],
  ["Team & Permissions", "Invite team members and manage staff role assignments.", "/admin/staff"],
  ["Activity Log", "Review sign-in activity, role updates, and system changes.", "/admin/audit"],
  ["Store Settings", "Configure currency, tax rates, shipping fees, and store policies.", "/admin/settings"],
];

export default function SuperAdminDashboardPage() {
  return <AdminShell permission="analytics.read"><div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-800">System Administration</p><h1 className="mt-2 font-display text-4xl sm:text-5xl">System Overview</h1><p className="mt-2 text-sm text-ink/60">Manage store operations, team access, and global configuration.</p></div><div className="grid gap-4 sm:grid-cols-2">{tools.map(([title, description, href]) => <Link key={title} href={href} className="rounded-3xl border border-ink/10 bg-paper p-6 transition hover:border-emerald-700/40 hover:shadow-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-700"><h2 className="font-display text-2xl">{title}</h2><p className="mt-2 text-sm leading-6 text-ink/60">{description}</p><span className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-emerald-800">Manage &rarr;</span></Link>)}</div></AdminShell>;
}
