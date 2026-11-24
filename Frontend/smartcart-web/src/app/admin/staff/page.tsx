"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { UserPlus, X } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { User, UserRole } from "@/lib/types";

function StaffTable() {
  const client = useQueryClient();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invitePreview, setInvitePreview] = useState("");
  const [invite, setInvite] = useState({
    name: "",
    email: "",
    role: "support" as Exclude<UserRole, "customer">,
  });
  const [modalUser, setModalUser] = useState<User | null>(null);
  const [statusReason, setStatusReason] = useState("");

  const staff = useQuery({ queryKey: ["admin-staff"], queryFn: api.staff });
  const session = useQuery({
    queryKey: ["admin-session"],
    queryFn: async () => (await fetch("/api/auth/session")).json() as Promise<{ user?: User }>,
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: UserRole }) => api.changeStaffRole(id, role),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin-staff"] });
      toast.success("Team member role updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, active, reason }: { id: string; active: boolean; reason: string }) =>
      api.changeAccountStatus(id, active, reason),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin-staff"] });
      setModalUser(null);
      setStatusReason("");
      toast.success("Staff account status updated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const isSuperAdmin = session.data?.user?.role === "super_admin";
  const canManageStaff = session.data?.user?.permissions?.includes("staff.manage") || false;

  const sendInvite = useMutation({
    mutationFn: () =>
      api.inviteStaff({
        name: invite.name.trim(),
        email: invite.email.trim(),
        role: invite.role,
      }),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["admin-staff"] });
      setInvitePreview(result.developmentEmailPreview || "");
      setInviteOpen(false);
      setInvite({ name: "", email: "", role: "support" });
      toast.success("Staff invitation created");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const resendInvite = useMutation({
    mutationFn: (id: string) => api.resendStaffInvite(id),
    onSuccess: (result) => {
      void client.invalidateQueries({ queryKey: ["admin-staff"] });
      setInvitePreview(result.developmentEmailPreview || "");
      toast.success("New invitation link generated");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const inviteLink = invitePreview.match(/https?:\/\/\S+/)?.[0];

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Team Management
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Staff & Permissions
          </h1>
          <p className="mt-1 text-xs text-ink/60">
            Invite team members and manage role assignments across support, inventory, and store administration.
          </p>
        </div>
        {canManageStaff && (
          <Button
            type="button"
            className="bg-emerald-800 hover:bg-emerald-900 text-white"
            onClick={() => setInviteOpen((open) => !open)}
          >
            <UserPlus size={15} className="mr-1.5" />
            {inviteOpen ? "Close Form" : "Invite Team Member"}
          </Button>
        )}
      </div>

      {inviteOpen && canManageStaff && (
        <form
          className="mb-6 grid gap-4 rounded-2xl border border-ink/10 bg-white p-5 shadow-xs md:grid-cols-4 dark:bg-zinc-900"
          onSubmit={(event) => {
            event.preventDefault();
            sendInvite.mutate();
          }}
        >
          <label className="block text-xs font-semibold text-ink/80">
            Full Name
            <input
              required
              minLength={2}
              maxLength={200}
              className="field mt-1"
              value={invite.name}
              onChange={(event) => setInvite({ ...invite, name: event.target.value })}
              placeholder="e.g., Priya Nair"
            />
          </label>
          <label className="block text-xs font-semibold text-ink/80">
            Work Email
            <input
              required
              type="email"
              className="field mt-1"
              value={invite.email}
              onChange={(event) => setInvite({ ...invite, email: event.target.value })}
              placeholder="priya@smartcart.com"
            />
          </label>
          <label className="block text-xs font-semibold text-ink/80">
            Assigned Role
            <select
              className="field mt-1"
              value={invite.role}
              onChange={(event) =>
                setInvite({
                  ...invite,
                  role: event.target.value as Exclude<UserRole, "customer">,
                })
              }
            >
              <option value="support">Customer Support</option>
              <option value="inventory_staff">Inventory Manager</option>
              <option value="admin">Store Manager (Admin)</option>
              {isSuperAdmin && <option value="super_admin">Super Admin</option>}
            </select>
          </label>
          <div className="flex items-end">
            <Button
              disabled={sendInvite.isPending}
              className="w-full bg-emerald-800 hover:bg-emerald-900 text-white"
            >
              {sendInvite.isPending ? "Sending..." : "Send Invitation"}
            </Button>
          </div>
        </form>
      )}

      {inviteLink && (
        <div className="mb-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-950">
          <p className="font-semibold">Onboarding Link Generated:</p>
          <a
            href={inviteLink}
            className="mt-1.5 inline-block break-all font-mono text-emerald-800 underline"
          >
            {inviteLink}
          </a>
        </div>
      )}

      {staff.isLoading ? (
        <div className="skeleton h-72 rounded-2xl" />
      ) : staff.error ? (
        <div role="alert" className="rounded-2xl bg-red-50 p-8 text-sm text-red-800">
          Could not load staff directory.{" "}
          <button className="ml-2 underline" onClick={() => void staff.refetch()}>
            Retry
          </button>
        </div>
      ) : !staff.data?.length ? (
        <div className="rounded-2xl bg-sand/30 p-10 text-center text-xs text-ink/60">
          No staff members have been added yet.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-2xs dark:bg-zinc-900">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="border-b border-ink/10 bg-sand/40 text-[11px] font-semibold uppercase tracking-wider text-ink/60">
              <tr>
                <th className="px-4 py-3.5">Team Member</th>
                <th className="px-4 py-3.5">Role</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {staff.data.map((user) => (
                <tr key={user.id} className="hover:bg-sand/20 transition">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-ink">{user.name}</p>
                    <p className="mt-0.5 text-ink/55">{user.email}</p>
                  </td>
                  <td className="px-4 py-3.5">
                    <select
                      aria-label={`Role for ${user.name}`}
                      disabled={
                        !canManageStaff ||
                        (!isSuperAdmin && user.role === "super_admin") ||
                        updateRole.isPending
                      }
                      value={user.role}
                      onChange={(event) => {
                        const role = event.target.value as UserRole;
                        updateRole.mutate({ id: user.id, role });
                      }}
                      className="rounded-xl border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink dark:bg-zinc-800"
                    >
                      <option value="support">Customer Support</option>
                      <option value="inventory_staff">Inventory Manager</option>
                      <option value="admin">Store Manager</option>
                      <option value="super_admin" disabled={!isSuperAdmin}>
                        Super Admin
                      </option>
                    </select>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        !user.emailVerified
                          ? "bg-amber-100 text-amber-800"
                          : user.isActive
                          ? "bg-emerald-100 text-emerald-900"
                          : "bg-red-100 text-red-900"
                      }`}
                    >
                      {!user.emailVerified
                        ? "Invite Pending"
                        : user.isActive
                        ? "Active"
                        : "Suspended"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex flex-wrap gap-2">
                      {canManageStaff && !user.emailVerified && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs px-3"
                          disabled={resendInvite.isPending}
                          onClick={() => resendInvite.mutate(user.id)}
                        >
                          Resend Link
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs px-3"
                        disabled={
                          (user.role === "super_admin" && !isSuperAdmin) ||
                          updateStatus.isPending
                        }
                        onClick={() => {
                          setModalUser(user);
                          setStatusReason("");
                        }}
                      >
                        {user.isActive ? "Suspend" : "Reactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modalUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <h3 className="font-display text-lg font-semibold text-ink">
                {modalUser.isActive ? "Suspend Staff Member" : "Reactivate Staff Member"}
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
                updateStatus.mutate({
                  id: modalUser.id,
                  active: !modalUser.isActive,
                  reason: statusReason.trim(),
                });
              }}
              className="mt-4 space-y-4"
            >
              <p className="text-xs text-ink/60">
                Staff member: <strong>{modalUser.name}</strong> ({modalUser.email})
              </p>
              <label className="block text-xs font-semibold text-ink/80">
                Reason
                <textarea
                  required
                  rows={3}
                  value={statusReason}
                  onChange={(e) => setStatusReason(e.target.value)}
                  placeholder="Enter reason for this status change..."
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
                  disabled={!statusReason.trim() || updateStatus.isPending}
                  className={
                    modalUser.isActive
                      ? "bg-red-700 hover:bg-red-800 text-white"
                      : "bg-emerald-800 hover:bg-emerald-900 text-white"
                  }
                >
                  {updateStatus.isPending
                    ? "Saving..."
                    : modalUser.isActive
                    ? "Suspend Access"
                    : "Restore Access"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminStaffPage() {
  return (
    <AdminShell permission="staff.read">
      <StaffTable />
    </AdminShell>
  );
}
