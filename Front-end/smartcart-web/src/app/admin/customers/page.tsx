"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Download, X } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { User } from "@/lib/types";

function CustomerTable() {
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [modalUser, setModalUser] = useState<User | null>(null);
  const [statusReason, setStatusReason] = useState("");

  const query = useMemo(
    () =>
      new URLSearchParams({
        page: String(page),
        limit: "20",
        ...(status ? { status } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      }).toString(),
    [page, status, search]
  );

  const customers = useQuery({
    queryKey: ["admin-customers", query],
    queryFn: () => api.adminCustomers(query),
  });
  const session = useQuery({
    queryKey: ["admin-session"],
    queryFn: async () => (await fetch("/api/auth/session")).json() as Promise<{ user?: User }>,
  });

  const canManage = session.data?.user?.permissions?.includes("customers.manage") || false;

  const update = useMutation({
    mutationFn: ({ id, active, reason }: { id: string; active: boolean; reason: string }) =>
      api.changeAccountStatus(id, active, reason),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin-customers"] });
      void client.invalidateQueries({ queryKey: ["admin-customers-summary"] });
      setModalUser(null);
      setStatusReason("");
      toast.success("Customer account updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const exportCustomers = async () => {
    try {
      const params = new URLSearchParams({
        limit: "5000",
        ...(status ? { status } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      });
      const blob = await api.exportCustomers(params.toString());
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "smartcart-customers.csv";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export customer list");
    }
  };

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Directory
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Customers
          </h1>
          <p className="mt-1 text-xs text-ink/60">
            View registered customers, verification status, and account standing.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void exportCustomers()}>
          <Download size={14} className="mr-1.5" /> Export CSV
        </Button>
      </div>

      <div className="mb-5 flex flex-wrap gap-3 rounded-2xl border border-ink/10 bg-sand/20 p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-2.5 text-ink/40" size={16} />
          <input
            aria-label="Search customers"
            className="w-full rounded-xl border border-ink/15 bg-white pl-9 pr-3 py-2 text-xs text-ink outline-none dark:bg-zinc-900"
            placeholder="Search by customer name or email..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          aria-label="Filter customer status"
          className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-ink dark:bg-zinc-900"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">All Accounts</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
        </select>
      </div>

      {customers.isLoading ? (
        <div className="skeleton h-72 rounded-2xl" />
      ) : customers.error ? (
        <div role="alert" className="rounded-2xl bg-red-50 p-8 text-sm text-red-800">
          Could not load customers.{" "}
          <button className="ml-2 underline" onClick={() => void customers.refetch()}>
            Retry
          </button>
        </div>
      ) : !customers.data?.data.length ? (
        <div className="rounded-2xl bg-sand/30 p-10 text-center text-xs text-ink/60">
          No customers match the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-2xs dark:bg-zinc-900">
          <table className="w-full min-w-[720px] text-left text-xs">
            <thead className="border-b border-ink/10 bg-sand/40 text-[11px] font-semibold uppercase tracking-wider text-ink/60">
              <tr>
                <th className="px-4 py-3.5">Customer</th>
                <th className="px-4 py-3.5">Joined</th>
                <th className="px-4 py-3.5">Email</th>
                <th className="px-4 py-3.5">Verification</th>
                <th className="px-4 py-3.5">Status</th>
                {canManage && <th className="px-4 py-3.5">Action</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {customers.data.data.map((user) => (
                <tr key={user.id} className="hover:bg-sand/20 transition">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-ink">{user.name}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-ink/40">
                      ID: {user.id.slice(-8)}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-ink/60">
                    {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-3.5 text-ink">{user.email}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`font-medium ${
                        user.emailVerified ? "text-emerald-700" : "text-amber-600"
                      }`}
                    >
                      {user.emailVerified ? "Verified" : "Pending"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        user.isActive
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-red-100 text-red-900"
                      }`}
                    >
                      {user.isActive ? "Active" : "Suspended"}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3.5">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-3"
                        disabled={update.isPending}
                        onClick={() => {
                          setModalUser(user);
                          setStatusReason("");
                        }}
                      >
                        {user.isActive ? "Suspend" : "Reactivate"}
                      </Button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {customers.data?.pagination && (
        <div className="mt-5 flex items-center justify-between text-xs text-ink/60">
          <span>
            Page {customers.data.pagination.page} of{" "}
            {Math.max(customers.data.pagination.pages || 1, 1)} •{" "}
            {customers.data.pagination.total} customers
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= customers.data.pagination.pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {modalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <h3 className="font-display text-lg font-semibold text-ink">
                {modalUser.isActive ? "Suspend Customer Account" : "Reactivate Customer Account"}
              </h3>
              <button
                onClick={() => setModalUser(null)}
                className="rounded-full p-1 text-ink/50 hover:bg-black/5"
              >
                <X size={18} />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!statusReason.trim()) return;
                update.mutate({
                  id: modalUser.id,
                  active: !modalUser.isActive,
                  reason: statusReason.trim(),
                });
              }}
              className="mt-4 space-y-4"
            >
              <p className="text-xs text-ink/60">
                Account: <strong>{modalUser.name}</strong> ({modalUser.email})
              </p>
              <label className="block text-xs font-semibold text-ink/80">
                Reason for status change
                <textarea
                  required
                  rows={3}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Enter note for account history..."
                  className="field mt-1"
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setModalUser(null)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!statusReason.trim() || update.isPending}
                  className={
                    modalUser.isActive
                      ? "bg-red-700 hover:bg-red-800 text-white"
                      : "bg-emerald-800 hover:bg-emerald-900 text-white"
                  }
                >
                  {update.isPending
                    ? "Saving..."
                    : modalUser.isActive
                    ? "Suspend Account"
                    : "Reactivate Account"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminCustomersPage() {
  return (
    <AdminShell permission="customers.read">
      <CustomerTable />
    </AdminShell>
  );
}
