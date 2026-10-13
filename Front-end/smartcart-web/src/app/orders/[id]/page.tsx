"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowLeft, ExternalLink, Package } from "lucide-react";
import { api } from "@/lib/api";
import { loadRazorpay, openRazorpayCheckout } from "@/lib/razorpay";
import { money } from "@/lib/utils";
import { AuthGate } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";

function OrderDetail() {
  const { id } = useParams<{ id: string }>();
  const qc = useQueryClient();
  const [returnDialogOpen, setReturnDialogOpen] = useState(false);
  const [returnReason, setReturnReason] = useState("");

  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api.order(id),
  });

  const { data: tracking } = useQuery({
    queryKey: ["tracking", id],
    queryFn: () => api.tracking(id),
    enabled: !!order,
  });

  const action = useMutation({
    mutationFn: (act: { type: "cancel" | "return"; reason?: string }) =>
      act.type === "cancel" ? api.cancelOrder(id) : api.returnOrder(id, act.reason || ""),
    onSuccess: (value) => {
      qc.setQueryData(["order", id], value);
      qc.invalidateQueries({ queryKey: ["orders"] });
      setReturnDialogOpen(false);
      setReturnReason("");
      toast.success("Order status updated successfully");
    },
    onError: (e) => toast.error(e.message || "This order cannot be updated at this time"),
  });

  const retryPayment = useMutation({
    mutationFn: async () => {
      if (!order) throw new Error("Order details are not available");
      if (order.paymentId && order.paymentCheckout) {
        return { payment: { _id: order.paymentId }, checkout: order.paymentCheckout };
      }
      return api.createPayment(
        {
          orderId: order._id,
          amount: order.totalAmount,
          paymentMethod: order.paymentMethod || "UPI",
        },
        `order-${order._id}`
      );
    },
    onSuccess: async (result) => {
      if (!order) return;
      if (!result.checkout) {
        toast.error("Razorpay could not initialize checkout. Please retry.");
        return;
      }
      try {
        await loadRazorpay();
        const checkout = openRazorpayCheckout(
          result.checkout,
          async (response) => {
            try {
              const verification = await api.verifyPayment(result.payment._id, {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              await qc.invalidateQueries({ queryKey: ["order", id] });
              await qc.invalidateQueries({ queryKey: ["orders"] });
              if (verification.payment.status === "SUCCESS") {
                await api.clearCart().catch(() => null);
                await qc.invalidateQueries({ queryKey: ["cart"] });
                toast.success("Payment verified and confirmed!");
              } else {
                toast.message("Payment is processing. Updates will reflect shortly.");
              }
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Payment verification failed");
            }
          },
          undefined,
          () => toast.message("Checkout closed without payment.")
        );
        checkout.on("payment.failed", () => toast.error("Payment failed. You can retry anytime."));
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not open payment gateway");
      }
    },
    onError: (e) => toast.error(e.message || "Could not initialize payment"),
  });

  if (isLoading) {
    return <div className="skeleton mx-auto mt-14 h-96 max-w-4xl rounded-3xl" />;
  }

  if (error || !order) {
    return (
      <section className="mx-auto max-w-4xl px-6 py-20 text-center">
        <p className="text-lg font-semibold text-ink">We couldn&apos;t locate this order.</p>
        <p className="mt-1 text-sm text-ink/60">It may have been archived or does not belong to your account.</p>
        <Button onClick={() => refetch()} className="mt-4">
          Try again
        </Button>
      </section>
    );
  }

  const canCancel = ["PENDING", "CONFIRMED"].includes(order.orderStatus) && order.paymentStatus !== "SUCCESS";
  const canReturn = order.orderStatus === "DELIVERED" && (!order.returnRequest || order.returnRequest.status === "NONE");
  const needsPayment = order.paymentMethod !== "COD" && order.paymentStatus !== "SUCCESS" && order.paymentStatus !== "REFUNDED";

  return (
    <section className="mx-auto max-w-5xl px-5 py-10 md:px-10 md:py-14">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink/60 hover:text-emerald-700 transition"
      >
        <ArrowLeft size={14} /> Back to My Orders
      </Link>

      {/* Header */}
      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-4 border-b border-ink/10 pb-6">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-bold uppercase text-emerald-800">
              Order #{order._id.slice(-8).toUpperCase()}
            </span>
            <span className="rounded-full bg-sand px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-ink/70">
              {order.orderStatus}
            </span>
          </div>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Order Details & Tracking
          </h1>
          <p className="mt-1 text-xs text-ink/50">
            Placed on{" "}
            {new Date(order.createdAt).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>

        <div className="text-right">
          <p className="text-2xl font-bold text-ink">{money(order.totalAmount, order.currency)}</p>
          <p className="text-xs font-medium text-emerald-700">
            Payment: {order.paymentStatus} ({order.paymentMethod || "ONLINE"})
          </p>
        </div>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        {/* Left: Items and Price Breakdown */}
        <div className="space-y-6">
          <div className="rounded-2xl border border-ink/10 bg-sand/20 p-6">
            <h2 className="text-lg font-semibold text-ink">Items in this Order</h2>
            <div className="mt-4 divide-y divide-ink/10">
              {order.items?.map((item) => (
                <div key={item.productId} className="flex items-center justify-between py-3.5 text-sm">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-lg bg-sand/60 text-ink/40">
                      <Package size={18} />
                    </div>
                    <div>
                      <p className="font-semibold text-ink">{item.name}</p>
                      <p className="text-xs text-ink/50">
                        Qty: {item.quantity} × {money(item.price, order.currency)}
                      </p>
                    </div>
                  </div>
                  <span className="font-bold text-ink">
                    {money(item.price * item.quantity, order.currency)}
                  </span>
                </div>
              ))}
            </div>

            {/* Price breakdown */}
            <div className="mt-6 space-y-2.5 border-t border-ink/10 pt-4 text-xs text-ink/70">
              {order.subtotalAmount != null && (
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <span className="font-medium text-ink">{money(order.subtotalAmount, order.currency)}</span>
                </div>
              )}
              {Boolean(order.discountAmount) && (
                <div className="flex justify-between text-emerald-700">
                  <span>Discount ({order.couponCode || "Coupon"})</span>
                  <span className="font-medium">−{money(order.discountAmount || 0, order.currency)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>Tax & Duties</span>
                <span className="font-medium text-ink">{money(order.taxAmount || 0, order.currency)}</span>
              </div>
              <div className="flex justify-between">
                <span>Shipping Fee</span>
                <span className="font-medium text-ink">
                  {order.shippingAmount ? money(order.shippingAmount, order.currency) : "FREE"}
                </span>
              </div>
              <div className="flex justify-between border-t border-ink/10 pt-3 text-sm font-bold text-ink">
                <span>Total Paid / Payable</span>
                <span className="text-base text-emerald-800">{money(order.totalAmount, order.currency)}</span>
              </div>
            </div>
          </div>

          {/* Shipping Address */}
          {order.shippingAddress && (
            <div className="rounded-2xl border border-ink/10 bg-sand/20 p-6 text-xs text-ink/75">
              <h3 className="text-sm font-semibold text-ink">Delivery Address</h3>
              <div className="mt-3 leading-relaxed">
                <p className="font-semibold text-ink">{order.shippingAddress.name || "Customer"}</p>
                <p>{order.shippingAddress.street || order.shippingAddress.addressLine1}</p>
                <p>
                  {[order.shippingAddress.city, order.shippingAddress.state, order.shippingAddress.postalCode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
                {order.shippingAddress.phone && <p className="mt-1 text-ink/50">Phone: {order.shippingAddress.phone}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Right: Shipment Tracking and Actions */}
        <aside className="space-y-6">
          <div className="rounded-2xl border border-ink/10 bg-sand/30 p-6">
            <h2 className="text-lg font-semibold text-ink">Shipment Status</h2>

            {tracking?.shipment?.carrier ? (
              <div className="mt-4 rounded-xl border border-ink/10 bg-white p-4 shadow-2xs dark:bg-zinc-900">
                <p className="text-xs font-semibold text-ink">
                  Carrier: <span className="font-bold text-emerald-700">{tracking.shipment.carrier}</span>
                </p>
                <p className="mt-1 font-mono text-xs text-ink/70">
                  Tracking: {tracking.shipment.trackingNumber}
                </p>
                {tracking.shipment.trackingUrl && (
                  <a
                    href={tracking.shipment.trackingUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 underline"
                  >
                    Track directly on carrier portal <ExternalLink size={12} />
                  </a>
                )}
              </div>
            ) : (
              <p className="mt-2 text-xs text-ink/60">
                Tracking details will be posted as soon as the package is dispatched.
              </p>
            )}

            {/* Timeline */}
            <div className="mt-6">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-ink/50">
                Activity History
              </h3>
              <ol className="mt-3 space-y-4 border-l border-ink/20 pl-4">
                {tracking?.history?.length ? (
                  tracking.history.map((event, index) => (
                    <li key={`${event.changedAt}-${index}`} className="relative text-xs">
                      <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-emerald-700" />
                      <span className="font-semibold text-ink">{event.status}</span>
                      <p className="text-[11px] text-ink/50">
                        {new Date(event.changedAt).toLocaleString()}
                      </p>
                      {event.note && <p className="mt-1 text-ink/70">{event.note}</p>}
                    </li>
                  ))
                ) : (
                  <li className="text-xs text-ink/50">Order received and confirmed.</li>
                )}
              </ol>
            </div>

            {/* Action buttons */}
            <div className="mt-6 space-y-2.5 pt-4 border-t border-ink/10">
              {needsPayment && (
                <Button
                  className="w-full rounded-xl bg-emerald-800 text-xs font-semibold text-white hover:bg-emerald-900 shadow-xs"
                  disabled={retryPayment.isPending}
                  onClick={() => retryPayment.mutate()}
                >
                  {retryPayment.isPending ? "Connecting Razorpay..." : "Complete Payment Now"}
                </Button>
              )}

              {canCancel && (
                <Button
                  variant="outline"
                  className="w-full rounded-xl text-xs font-medium text-red-600 hover:bg-red-50"
                  disabled={action.isPending}
                  onClick={() => action.mutate({ type: "cancel" })}
                >
                  Cancel Order
                </Button>
              )}

              {canReturn && (
                <Button
                  variant="outline"
                  className="w-full rounded-xl text-xs font-medium"
                  disabled={action.isPending}
                  onClick={() => setReturnDialogOpen(true)}
                >
                  Request Return / Replacement
                </Button>
              )}
            </div>

            {/* Return Request Status */}
            {order.returnRequest && order.returnRequest.status !== "NONE" && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs dark:bg-amber-950/20">
                <p className="font-semibold text-amber-900 dark:text-amber-300">
                  Return Status: {order.returnRequest.status}
                </p>
                <p className="mt-1 text-amber-800/80 dark:text-amber-400">
                  Reason: {order.returnRequest.reason}
                </p>
                {order.returnRequest.reviewNote && (
                  <p className="mt-1 text-amber-900 dark:text-amber-200">
                    Staff update: {order.returnRequest.reviewNote}
                  </p>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Return Request Modal */}
      {returnDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-paper p-6 shadow-2xl">
            <h3 className="font-display text-xl font-semibold text-ink">Request Return or Replacement</h3>
            <p className="mt-1 text-xs text-ink/60">
              Please share the reason for requesting a return so our store staff can review it.
            </p>

            <textarea
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="e.g., Wrong size received, defective item, changed mind..."
              className="mt-4 w-full rounded-xl border border-ink/15 p-3 text-xs outline-none focus:border-emerald-700"
              rows={4}
            />

            <div className="mt-5 flex justify-end gap-2.5">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setReturnDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                className="bg-emerald-800 text-white hover:bg-emerald-900"
                disabled={!returnReason.trim() || action.isPending}
                onClick={() => action.mutate({ type: "return", reason: returnReason.trim() })}
              >
                Submit Return Request
              </Button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

export default function OrderDetailPage() {
  return (
    <AuthGate>
      <OrderDetail />
    </AuthGate>
  );
}
