"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { AdminShell } from "@/components/admin-shell";
import { useStoreCurrency } from "@/lib/use-store-currency";
import { money } from "@/lib/utils";
import { Button } from "@/components/ui/button";

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="rounded-2xl border border-ink/10 bg-white p-5 shadow-2xs dark:bg-zinc-900">
      <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">{label}</p>
      <p className="mt-2 font-display text-3xl font-semibold text-ink">{value}</p>
      <p className="mt-1.5 text-xs text-ink/55">{detail}</p>
    </article>
  );
}

function Overview() {
  const currency = useStoreCurrency();
  const [trendDays, setTrendDays] = useState(30);
  const orders = useQuery({
    queryKey: ["admin-orders-summary", trendDays],
    queryFn: () => api.adminOrderSummary(trendDays),
  });
  const customers = useQuery({
    queryKey: ["admin-customers-summary"],
    queryFn: api.adminCustomerSummary,
  });
  const inventory = useQuery({
    queryKey: ["admin-inventory-summary"],
    queryFn: api.adminInventorySummary,
  });
  const topProducts = useQuery({
    queryKey: ["admin-top-products"],
    queryFn: () => api.adminTopProducts("limit=10"),
  });

  const error = orders.error || customers.error || inventory.error || topProducts.error;
  const retry = () => {
    void orders.refetch();
    void customers.refetch();
    void inventory.refetch();
    void topProducts.refetch();
  };
  const loading = orders.isLoading || customers.isLoading || inventory.isLoading;

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Dashboard
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Store Overview
          </h1>
          <p className="mt-1 text-xs text-ink/60">
            Key store performance metrics, order volume, and inventory status.
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/products">Open Storefront</Link>
        </Button>
      </div>

      {error && (
        <div
          role="alert"
          className="mb-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl bg-red-50 p-5 text-sm text-red-800"
        >
          <p>Some metrics could not be loaded right now.</p>
          <Button variant="outline" size="sm" onClick={retry}>
            Retry
          </Button>
        </div>
      )}

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, index) => (
            <div key={index} className="skeleton h-28 rounded-2xl" />
          ))}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Total Orders"
            value={String(orders.data?.totalOrders ?? "—")}
            detail={`${orders.data?.pendingShipments ?? 0} awaiting shipment`}
          />
          <Metric
            label="Gross Revenue"
            value={money(orders.data?.grossSales ?? 0, currency)}
            detail="Total sales before discounts"
          />
          <Metric
            label="Net Sales"
            value={money(orders.data?.netSales ?? 0, currency)}
            detail={`After ${money(orders.data?.discounts ?? 0, currency)} discounts`}
          />
          <Metric
            label="Registered Customers"
            value={String(customers.data?.customers ?? "—")}
            detail={`${customers.data?.newCustomers30d ?? 0} new in last 30 days`}
          />
          <Metric
            label="Paid Orders"
            value={String(orders.data?.paidOrders ?? "—")}
            detail="Completed payments"
          />
          <Metric
            label="Pending Payments"
            value={String(orders.data?.pendingPayments ?? "—")}
            detail={`${orders.data?.failedPayments ?? 0} failed · ${orders.data?.refundedPayments ?? 0} refunded`}
          />
          <Metric
            label="Low Stock Items"
            value={String(inventory.data?.lowStock ?? "—")}
            detail={`At or below ${inventory.data?.lowStockThreshold ?? 5} units`}
          />
          <Metric
            label="Out of Stock"
            value={String(inventory.data?.outOfStock ?? "—")}
            detail={`Across ${inventory.data?.totalProducts ?? 0} total products`}
          />
        </div>
      )}

      <section className="mt-8 rounded-2xl border border-ink/10 bg-white p-6 shadow-2xs dark:bg-zinc-900">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Revenue Trend
            </p>
            <h2 className="mt-1 font-display text-2xl font-semibold text-ink">
              Sales over the last {trendDays} days
            </h2>
          </div>
          <select
            aria-label="Sales trend period"
            className="rounded-xl border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink dark:bg-zinc-800"
            value={trendDays}
            onChange={(event) => setTrendDays(Number(event.target.value))}
          >
            <option value={7}>Last 7 days</option>
            <option value={30}>Last 30 days</option>
            <option value={90}>Last 90 days</option>
          </select>
        </div>

        {orders.data?.trend.length ? (
          <div className="flex h-48 items-end gap-1.5 overflow-x-auto border-b border-ink/10 pb-2">
            {orders.data.trend.map((day) => {
              const max = Math.max(...orders.data!.trend.map((item) => item.sales), 1);
              return (
                <div
                  key={day._id}
                  className="group flex min-w-3 flex-1 flex-col items-center justify-end"
                  title={`${day._id}: ${money(day.sales, currency)} (${day.orders} orders)`}
                >
                  <div
                    className="w-full rounded-t bg-emerald-700/75 transition-colors group-hover:bg-emerald-700"
                    style={{ height: `${Math.max(4, (day.sales / max) * 100)}%` }}
                  />
                  <span className="mt-2 hidden text-[9px] text-ink/45 group-hover:block">
                    {day._id.slice(5)}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="rounded-xl bg-sand/40 p-8 text-center text-xs text-ink/60">
            No completed sales recorded in this period yet.
          </p>
        )}
      </section>

      <section className="mt-8 rounded-2xl border border-ink/10 bg-white p-6 shadow-2xs dark:bg-zinc-900">
        <div className="mb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Top Performers
          </p>
          <h2 className="mt-1 font-display text-2xl font-semibold text-ink">
            Best-Selling Products
          </h2>
        </div>

        {topProducts.isLoading ? (
          <div className="skeleton h-40 rounded-2xl" />
        ) : topProducts.isError ? (
          <p role="alert" className="text-xs text-red-700">
            Could not load top products.{" "}
            <button className="underline" onClick={() => void topProducts.refetch()}>
              Retry
            </button>
          </p>
        ) : !topProducts.data?.length ? (
          <p className="rounded-xl bg-sand/40 p-8 text-center text-xs text-ink/60">
            No product sales data available yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-ink/10">
            <table className="w-full min-w-[600px] text-left text-xs">
              <thead className="bg-sand/50 text-[11px] font-semibold uppercase tracking-wider text-ink/60">
                <tr>
                  {["Product Name", "Category", "Units Sold", "Total Revenue"].map((label) => (
                    <th key={label} className="px-4 py-3">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-ink/5">
                {topProducts.data.map((product) => (
                  <tr key={product.productId}>
                    <td className="px-4 py-3 font-medium text-ink">{product.name}</td>
                    <td className="px-4 py-3 text-ink/70">{product.category}</td>
                    <td className="px-4 py-3 font-semibold text-ink">{product.unitsSold}</td>
                    <td className="px-4 py-3 font-bold text-emerald-800">
                      {money(product.grossSales, currency)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function AdminPage() {
  return (
    <AdminShell permission="analytics.read">
      <Overview />
    </AdminShell>
  );
}
