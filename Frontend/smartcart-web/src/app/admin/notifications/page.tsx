"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

const statuses = ["QUEUED", "SENDING", "SENT", "MOCKED", "FAILED", "UNCERTAIN", "SKIPPED"];

function NotificationsAdmin() {
  const client = useQueryClient();
  const [status, setStatus] = useState("");
  const query = new URLSearchParams({ page: "1", limit: "50", ...(status ? { status } : {}) }).toString();
  const notifications = useQuery({ queryKey: ["admin-notifications", query], queryFn: () => api.adminNotifications(query), refetchInterval: 5000 });
  const retry = useMutation({ mutationFn: (id: string) => api.retryNotification(id), onSuccess: () => { void client.invalidateQueries({ queryKey: ["admin-notifications"] }); toast.success("Notification requeued"); }, onError: (error: Error) => toast.error(error.message) });

  return <>
    <div className="mb-8"><p className="text-xs font-semibold uppercase tracking-[.2em] text-emerald-800">Communications</p><h1 className="mt-2 font-display text-4xl sm:text-5xl">Email Log</h1><p className="mt-2 text-sm text-ink/60">Track transactional emails sent to customers and retry failed deliveries.</p></div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><select aria-label="Filter by delivery status" className="rounded-full border border-ink/15 bg-paper px-4 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((value) => <option key={value}>{value}</option>)}</select><span className="text-xs text-ink/45">Showing latest 50 records</span></div>
    {notifications.isLoading ? <div className="skeleton h-72 rounded-3xl"/> : notifications.error ? <div role="alert" className="rounded-3xl bg-red-50 p-8 text-sm text-red-800">Could not load delivery records. <button className="ml-2 underline" onClick={() => void notifications.refetch()}>Try again</button></div> : !notifications.data?.data.length ? <div className="rounded-3xl bg-sand p-10 text-center text-sm text-ink/55">No notification records match this filter.</div> : <div className="overflow-x-auto rounded-3xl border border-ink/10"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-sand/60 text-xs uppercase tracking-wide text-ink/50"><tr><th className="px-5 py-4">Created</th><th className="px-5 py-4">Event</th><th className="px-5 py-4">Recipient</th><th className="px-5 py-4">Status</th><th className="px-5 py-4">Attempts</th><th className="px-5 py-4">Provider / error</th><th className="px-5 py-4">Action</th></tr></thead><tbody>{notifications.data.data.map((item) => <tr key={item._id} className="border-t border-ink/10"><td className="whitespace-nowrap px-5 py-4 text-xs">{new Date(item.createdAt).toLocaleString()}</td><td className="px-5 py-4 text-xs">{item.event}</td><td className="px-5 py-4 text-xs">{item.recipient}</td><td className="px-5 py-4 text-xs font-medium">{item.status}</td><td className="px-5 py-4 text-xs">{item.attemptCount}</td><td className="max-w-64 px-5 py-4 text-xs"><span>{item.providerMessageId || item.provider}</span>{item.lastError && <p className="mt-1 truncate text-red-700" title={item.lastError}>{item.lastError}</p>}</td><td className="px-5 py-4">{item.status === "FAILED" ? <Button variant="outline" size="sm" disabled={retry.isPending} onClick={() => retry.mutate(item._id)}>Retry</Button> : <span className="text-xs text-ink/40">—</span>}</td></tr>)}</tbody></table></div>}
    {notifications.data?.pagination && <div className="mt-4 text-xs text-ink/50">Showing {notifications.data.data.length} of {notifications.data.pagination.total} notifications.</div>}
  </>;
}

export default function AdminNotificationsPage() { return <AdminShell permission="notifications.manage"><NotificationsAdmin /></AdminShell>; }
