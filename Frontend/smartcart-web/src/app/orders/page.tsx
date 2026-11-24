"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Package, ArrowRight, ChevronRight, Clock, CheckCircle2, Truck, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";
import { useStoreCurrency } from "@/lib/use-store-currency";
import { money } from "@/lib/utils";
import { AuthGate } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";

function getStatusBadge(status: string) {
  const norm = status?.toUpperCase() || "";
  switch (norm) {
    case "DELIVERED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
          <CheckCircle2 size={13} /> Delivered
        </span>
      );
    case "SHIPPED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
          <Truck size={13} /> Shipped
        </span>
      );
    case "PROCESSING":
    case "CONFIRMED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
          <Clock size={13} /> Processing
        </span>
      );
    case "CANCELLED":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">
          <AlertTriangle size={13} /> Cancelled
        </span>
      );
    default:
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-0.5 text-xs font-semibold text-zinc-800">
          {status}
        </span>
      );
  }
}

function Orders() {
  const currency = useStoreCurrency();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["orders"],
    queryFn: () => api.orders(),
  });

  return (
    <section className="mx-auto max-w-5xl px-5 py-10 md:px-10 md:py-14">
      <div className="border-b border-ink/10 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Order History</p>
        <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight text-ink md:text-4xl">
          My Orders
        </h1>
        <p className="mt-1 text-xs text-ink/60">
          View and track past orders, access invoices, or request returns.
        </p>
      </div>

      {isLoading ? (
        <div className="mt-8 space-y-4">
          <div className="skeleton h-28 rounded-2xl" />
          <div className="skeleton h-28 rounded-2xl" />
          <div className="skeleton h-28 rounded-2xl" />
        </div>
      ) : error ? (
        <div role="alert" className="mt-8 rounded-2xl border border-red-100 bg-red-50 p-8 text-center">
          <p className="font-semibold text-red-800">Could not retrieve your orders.</p>
          <Button variant="outline" className="mt-4" onClick={() => refetch()}>
            Retry
          </Button>
        </div>
      ) : data?.length ? (
        <div className="mt-8 space-y-4">
          {data.map((order) => {
            const itemCount = order.items?.reduce((s, i) => s + i.quantity, 0) || 0;
            return (
              <Link
                key={order._id}
                href={`/orders/${order._id}`}
                className="group block rounded-2xl border border-ink/10 bg-sand/20 p-5 transition duration-200 hover:border-ink/20 hover:bg-sand/40 hover:shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono font-bold text-ink/80">
                        #{order._id.slice(-8).toUpperCase()}
                      </span>
                      {getStatusBadge(order.orderStatus)}
                    </div>
                    <p className="text-sm font-semibold text-ink">
                      {itemCount} {itemCount === 1 ? "item" : "items"} •{" "}
                      {order.items?.map((i) => i.name).slice(0, 2).join(", ")}
                      {order.items?.length > 2 ? ` and ${order.items.length - 2} more` : ""}
                    </p>
                    <p className="text-xs text-ink/50">
                      Placed on{" "}
                      {new Date(order.createdAt).toLocaleDateString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-5">
                    <div className="text-right">
                      <p className="text-base font-bold text-ink">
                        {money(order.totalAmount, currency)}
                      </p>
                      <p className="text-[11px] font-medium text-ink/50">
                        {order.paymentMethod || "ONLINE"} • {order.paymentStatus}
                      </p>
                    </div>

                    <div className="grid h-8 w-8 place-items-center rounded-full bg-sand/60 text-ink/40 transition group-hover:bg-emerald-700 group-hover:text-white">
                      <ChevronRight size={18} />
                    </div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="mt-10 rounded-3xl border border-ink/10 bg-sand/30 p-12 text-center max-w-lg mx-auto">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sand text-ink/40">
            <Package size={30} />
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold text-ink">No orders yet</h2>
          <p className="mt-1 text-sm text-ink/60">
            When you place an order, you can track delivery and view details right here.
          </p>
          <Button asChild className="mt-6 rounded-full px-8">
            <Link href="/products">
              Explore Catalog <ArrowRight size={14} className="ml-2" />
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}

export default function OrdersPage() {
  return (
    <AuthGate>
      <Orders />
    </AuthGate>
  );
}
