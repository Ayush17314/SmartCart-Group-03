"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, Clock, Truck, AlertTriangle, X, Search } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Order, User } from "@/lib/types";
import { useStoreCurrency } from "@/lib/use-store-currency";
import { money } from "@/lib/utils";

const statuses = ["PENDING", "CONFIRMED", "SHIPPED", "DELIVERED", "CANCELLED", "RETURNED"];
const transitions: Record<string, string[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED"],
  DELIVERED: [],
  CANCELLED: [],
  RETURNED: [],
};

function getStatusBadge(status: string) {
  const norm = status?.toUpperCase() || "";
  switch (norm) {
    case "DELIVERED":
      return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800"><CheckCircle2 size={12} /> Delivered</span>;
    case "SHIPPED":
      return <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800"><Truck size={12} /> Shipped</span>;
    case "CONFIRMED":
      return <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-xs font-semibold text-teal-800"><CheckCircle2 size={12} /> Confirmed</span>;
    case "PENDING":
      return <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800"><Clock size={12} /> Pending</span>;
    case "CANCELLED":
      return <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800"><AlertTriangle size={12} /> Cancelled</span>;
    default:
      return <span className="inline-flex items-center rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-800">{status}</span>;
  }
}

function OrdersAdmin() {
  const currency = useStoreCurrency();
  const client = useQueryClient();
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  // Status transition modal state
  const [statusModalOrder, setStatusModalOrder] = useState<Order | null>(null);
  const [targetStatus, setTargetStatus] = useState<string>("");
  const [statusNote, setStatusNote] = useState<string>("");
  const [carrier, setCarrier] = useState<string>("Delhivery");
  const [trackingNumber, setTrackingNumber] = useState<string>("");
  const [trackingUrl, setTrackingUrl] = useState<string>("");

  // Return review modal state
  const [returnModalOrder, setReturnModalOrder] = useState<Order | null>(null);
  const [returnReviewAction, setReturnReviewAction] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [returnReviewNote, setReturnReviewNote] = useState<string>("");

  const query = useMemo(
    () =>
      new URLSearchParams({
        page: String(page),
        limit: "20",
        ...(status ? { status } : {}),
        ...(paymentStatus ? { paymentStatus } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
        ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
        ...(to ? { to: new Date(`${to}T23:59:59.999`).toISOString() } : {}),
      }).toString(),
    [page, status, paymentStatus, search, from, to]
  );

  const orders = useQuery({ queryKey: ["admin-orders", query], queryFn: () => api.adminOrders(query) });
  const session = useQuery({
    queryKey: ["admin-session"],
    queryFn: async () => {
      const response = await fetch("/api/auth/session", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not verify session");
      return response.json() as Promise<{ authenticated: boolean; user?: User }>;
    },
    retry: false,
  });

  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { status: string; note?: string; shipment?: { carrier: string; trackingNumber: string; trackingUrl?: string } } }) =>
      api.updateOrderStatus(id, body),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin-orders"] });
      void client.invalidateQueries({ queryKey: ["admin-orders-summary"] });
      void client.invalidateQueries({ queryKey: ["orders"] });
      setStatusModalOrder(null);
      toast.success("Order status updated successfully");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateReturn = useMutation({
    mutationFn: ({ id, next, note }: { id: string; next: "APPROVED" | "REJECTED"; note: string }) =>
      api.reviewReturn(id, next, note),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin-orders"] });
      setReturnModalOrder(null);
      toast.success("Return request reviewed successfully");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const completeReturn = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => api.completeReturn(id, note),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin-orders"] });
      void client.invalidateQueries({ queryKey: ["admin-orders-summary"] });
      toast.success("Return marked received and complete");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const refund = useMutation({
    mutationFn: (paymentId: string) => api.refundPayment(paymentId),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin-orders"] });
      void client.invalidateQueries({ queryKey: ["admin-orders-summary"] });
      toast.success("Refund submitted to payment gateway");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const openStatusTransition = (order: Order, next: string) => {
    if (next === "CANCELLED" && order.paymentStatus === "SUCCESS") {
      toast.error("Paid orders must use the return and refund process.");
      return;
    }
    setStatusModalOrder(order);
    setTargetStatus(next);
    setStatusNote("");
    setCarrier("Delhivery");
    setTrackingNumber("");
    setTrackingUrl("");
  };

  const handleStatusSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusModalOrder || !targetStatus) return;

    let shipment: { carrier: string; trackingNumber: string; trackingUrl?: string } | undefined;
    if (targetStatus === "SHIPPED") {
      if (!carrier.trim() || !trackingNumber.trim()) {
        toast.error("Carrier name and Tracking Number are required to ship.");
        return;
      }
      shipment = {
        carrier: carrier.trim(),
        trackingNumber: trackingNumber.trim(),
        trackingUrl: trackingUrl.trim() || undefined,
      };
    }

    update.mutate({
      id: statusModalOrder._id,
      body: { status: targetStatus, note: statusNote.trim() || undefined, shipment },
    });
  };

  const openReturnReview = (order: Order, actionType: "APPROVED" | "REJECTED") => {
    setReturnModalOrder(order);
    setReturnReviewAction(actionType);
    setReturnReviewNote("");
  };

  const handleReturnReviewSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!returnModalOrder) return;
    updateReturn.mutate({
      id: returnModalOrder._id,
      next: returnReviewAction,
      note: returnReviewNote.trim() || (returnReviewAction === "APPROVED" ? "Approved by staff" : "Rejected by staff"),
    });
  };

  return (
    <>
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Fulfillment Center</p>
        <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
          Order Management
        </h1>
        <p className="mt-1 text-xs text-ink/60">
          Process customer orders, assign courier shipments, review return requests, and track payments.
        </p>
      </div>

      {/* Filter and search controls */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-2xl border border-ink/10 bg-sand/20 p-4">
        <div className="relative min-w-[240px] flex-1">
          <Search className="absolute left-3 top-2.5 text-ink/40" size={16} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            aria-label="Search order ID or customer ID"
            className="w-full rounded-xl border border-ink/15 bg-white pl-9 pr-3 py-2 text-xs text-ink outline-none transition focus:border-emerald-700 dark:bg-zinc-900"
            placeholder="Search by Order ID or User ID..."
          />
        </div>

        <select
          aria-label="Filter by order status"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-ink outline-none dark:bg-zinc-900"
        >
          <option value="">All Order Statuses</option>
          {statuses.map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>

        <select
          aria-label="Filter by payment status"
          value={paymentStatus}
          onChange={(event) => {
            setPaymentStatus(event.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-ink outline-none dark:bg-zinc-900"
        >
          <option value="">All Payment Statuses</option>
          {["PENDING", "SUCCESS", "FAILED", "REFUNDED"].map((value) => (
            <option key={value} value={value}>{value}</option>
          ))}
        </select>

        <div className="flex items-center gap-2 text-xs text-ink/60">
          <span>From</span>
          <input
            type="date"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-ink/15 bg-white px-2.5 py-1.5 text-xs text-ink outline-none dark:bg-zinc-900"
          />
          <span>To</span>
          <input
            type="date"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
            className="rounded-xl border border-ink/15 bg-white px-2.5 py-1.5 text-xs text-ink outline-none dark:bg-zinc-900"
          />
        </div>
      </div>

      {/* Orders table */}
      {orders.isLoading ? (
        <div className="skeleton h-72 rounded-2xl" />
      ) : orders.error ? (
        <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 p-8 text-center text-sm text-red-800">
          <p className="font-semibold">Unable to load orders.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => void orders.refetch()}>
            Retry
          </Button>
        </div>
      ) : !orders.data?.data.length ? (
        <div className="rounded-2xl border border-ink/10 bg-sand/30 p-12 text-center text-sm text-ink/60">
          No orders match the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-2xs dark:bg-zinc-900">
          <table className="w-full min-w-[1000px] text-left text-xs">
            <thead className="border-b border-ink/10 bg-sand/40 text-[11px] font-semibold uppercase tracking-wider text-ink/60">
              <tr>
                <th className="px-4 py-3.5">Order ID</th>
                <th className="px-4 py-3.5">Customer</th>
                <th className="px-4 py-3.5">Date</th>
                <th className="px-4 py-3.5">Total</th>
                <th className="px-4 py-3.5">Payment</th>
                <th className="px-4 py-3.5">Order Status</th>
                <th className="px-4 py-3.5">Returns / Refunds</th>
                <th className="px-4 py-3.5">Advance Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {orders.data.data.map((order) => (
                <tr key={order._id} className="transition hover:bg-sand/20">
                  <td className="px-4 py-3.5 font-mono font-semibold text-ink">
                    #{order._id.slice(-8).toUpperCase()}
                    <p className="font-sans text-[11px] font-normal text-ink/50">
                      {order.items.length} {order.items.length === 1 ? "item" : "items"}
                    </p>
                  </td>
                  <td className="px-4 py-3.5">
                    <p className="font-medium text-ink">{order.shippingAddress?.name || "Customer"}</p>
                    <p className="font-mono text-[10px] text-ink/40">User: {order.userId.slice(-6)}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3.5 text-ink/60">
                    {new Date(order.createdAt).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-4 py-3.5 font-bold text-ink">
                    {money(order.totalAmount, currency)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="font-medium text-ink">{order.paymentMethod || "ONLINE"}</span>
                    <span className={`block text-[10px] font-semibold uppercase ${
                      order.paymentStatus === "SUCCESS" ? "text-emerald-700" :
                      order.paymentStatus === "FAILED" ? "text-red-600" :
                      order.paymentStatus === "REFUNDED" ? "text-purple-700" : "text-amber-600"
                    }`}>
                      {order.paymentStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    {getStatusBadge(order.orderStatus)}
                    {order.shipment?.carrier && (
                      <p className="mt-1 font-mono text-[10px] text-ink/50">
                        {order.shipment.carrier}: {order.shipment.trackingNumber}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {order.returnRequest && order.returnRequest.status !== "NONE" ? (
                      <div className="space-y-1">
                        <span className="inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                          {order.returnRequest.status}
                        </span>
                        <p className="max-w-[180px] truncate text-[11px] text-ink/60" title={order.returnRequest.reason}>
                          {order.returnRequest.reason}
                        </p>
                        {order.returnRequest.status === "REQUESTED" && (
                          <div className="flex gap-2 pt-0.5">
                            <button
                              onClick={() => openReturnReview(order, "APPROVED")}
                              className="text-[11px] font-semibold text-emerald-700 hover:underline"
                            >
                              Approve
                            </button>
                            <button
                              onClick={() => openReturnReview(order, "REJECTED")}
                              className="text-[11px] font-semibold text-red-600 hover:underline"
                            >
                              Reject
                            </button>
                          </div>
                        )}
                        {order.returnRequest.status === "APPROVED" && (
                          <button
                            onClick={() => completeReturn.mutate({ id: order._id, note: "Items inspected & received at fulfillment hub" })}
                            className="text-[11px] font-semibold text-emerald-800 hover:underline"
                            disabled={completeReturn.isPending}
                          >
                            Mark Received
                          </button>
                        )}
                        {["APPROVED", "COMPLETED"].includes(order.returnRequest.status) &&
                          order.paymentStatus === "SUCCESS" &&
                          order.paymentId &&
                          session.data?.user?.permissions?.includes("refunds.approve") && (
                            <button
                              onClick={() => refund.mutate(order.paymentId as string)}
                              className="text-[11px] font-semibold text-purple-700 hover:underline block"
                              disabled={refund.isPending}
                            >
                              Issue Refund
                            </button>
                          )}
                      </div>
                    ) : (
                      <span className="text-ink/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {transitions[order.orderStatus]?.length ? (
                      <div className="flex gap-1.5 flex-wrap">
                        {transitions[order.orderStatus].map((next) => (
                          <button
                            key={next}
                            onClick={() => openStatusTransition(order, next)}
                            className="rounded-lg border border-ink/15 bg-sand/30 px-2.5 py-1 text-[11px] font-medium text-ink hover:border-emerald-700 hover:bg-emerald-50 hover:text-emerald-800 transition"
                          >
                            {next === "CONFIRMED" ? "Confirm" : next === "SHIPPED" ? "Ship" : next === "DELIVERED" ? "Deliver" : next}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <span className="text-[11px] text-ink/40 font-medium">Completed</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {orders.data?.pagination && (
        <div className="mt-5 flex items-center justify-between text-xs text-ink/60">
          <span>
            Page {orders.data.pagination.page} of {Math.max(orders.data.pagination.pages || 1, 1)} • Total {orders.data.pagination.total ?? 0} orders
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((v) => v - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!orders.data.pagination.hasNext}
              onClick={() => setPage((v) => v + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}

      {/* Modal: Status Transition */}
      {statusModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <h3 className="font-display text-lg font-semibold text-ink">
                Advance Order to {targetStatus}
              </h3>
              <button
                onClick={() => setStatusModalOrder(null)}
                className="rounded-full p-1 text-ink/50 hover:bg-black/5"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleStatusSubmit} className="mt-4 space-y-4">
              <p className="text-xs text-ink/60">
                Moving order <span className="font-mono font-bold">#{statusModalOrder._id.slice(-8).toUpperCase()}</span> from <span className="font-semibold">{statusModalOrder.orderStatus}</span> to <span className="font-semibold text-emerald-800">{targetStatus}</span>.
              </p>

              {targetStatus === "SHIPPED" && (
                <div className="space-y-3 rounded-xl border border-ink/10 bg-sand/20 p-3.5">
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-ink/70">
                    Shipment Courier Details
                  </h4>
                  <div>
                    <label className="block text-[11px] font-medium text-ink/60">Carrier / Courier Name</label>
                    <select
                      value={carrier}
                      onChange={(e) => setCarrier(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-ink/15 bg-white p-2 text-xs text-ink"
                    >
                      <option value="Delhivery">Delhivery</option>
                      <option value="BlueDart">BlueDart</option>
                      <option value="DTDC">DTDC</option>
                      <option value="FedEx">FedEx</option>
                      <option value="India Post">India Post</option>
                      <option value="DHL">DHL</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-ink/60">Tracking / AWB Number</label>
                    <input
                      required
                      value={trackingNumber}
                      onChange={(e) => setTrackingNumber(e.target.value)}
                      placeholder="e.g., DEL123456789IN"
                      className="mt-1 w-full rounded-lg border border-ink/15 bg-white p-2 text-xs text-ink font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-ink/60">Tracking URL (Optional)</label>
                    <input
                      value={trackingUrl}
                      onChange={(e) => setTrackingUrl(e.target.value)}
                      placeholder="https://track.courier.com/..."
                      className="mt-1 w-full rounded-lg border border-ink/15 bg-white p-2 text-xs text-ink"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[11px] font-medium text-ink/60">Staff Audit Note (Optional)</label>
                <input
                  value={statusNote}
                  onChange={(e) => setStatusNote(e.target.value)}
                  placeholder="e.g., Packed and dispatched via surface express"
                  className="mt-1 w-full rounded-lg border border-ink/15 bg-white p-2 text-xs text-ink"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setStatusModalOrder(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={update.isPending}
                  className="bg-emerald-800 text-white hover:bg-emerald-900"
                >
                  {update.isPending ? "Updating..." : `Confirm ${targetStatus}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Return Review */}
      {returnModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <h3 className="font-display text-lg font-semibold text-ink">
                Review Return Request
              </h3>
              <button
                onClick={() => setReturnModalOrder(null)}
                className="rounded-full p-1 text-ink/50 hover:bg-black/5"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleReturnReviewSubmit} className="mt-4 space-y-4">
              <div className="rounded-xl border border-ink/10 bg-sand/30 p-3 text-xs">
                <p className="font-semibold text-ink">Customer Return Reason:</p>
                <p className="mt-1 text-ink/75 italic">&ldquo;{returnModalOrder.returnRequest?.reason}&rdquo;</p>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-ink/60">Decision Note</label>
                <textarea
                  value={returnReviewNote}
                  onChange={(e) => setReturnReviewNote(e.target.value)}
                  placeholder={`Reason for ${returnReviewAction.toLowerCase()} this return...`}
                  className="mt-1 w-full rounded-lg border border-ink/15 bg-white p-2 text-xs text-ink"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setReturnModalOrder(null)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={updateReturn.isPending}
                  className={returnReviewAction === "APPROVED" ? "bg-emerald-800 text-white hover:bg-emerald-900" : "bg-red-700 text-white hover:bg-red-800"}
                >
                  {updateReturn.isPending ? "Submitting..." : `${returnReviewAction === "APPROVED" ? "Approve" : "Reject"} Return`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminOrdersPage() {
  return (
    <AdminShell permission="orders.read_all">
      <OrdersAdmin />
    </AdminShell>
  );
}
