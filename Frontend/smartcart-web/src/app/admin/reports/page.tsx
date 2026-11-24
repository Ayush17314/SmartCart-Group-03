"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { useStoreCurrency } from "@/lib/use-store-currency";
import { money } from "@/lib/utils";
import { toast } from "sonner";

function Reports() {
  const currency = useStoreCurrency();
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);
  const [inventoryPage, setInventoryPage] = useState(1);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const params = new URLSearchParams({ page: String(page), limit: "50" });
  const inventoryParams = new URLSearchParams({ page: String(inventoryPage), limit: "50" });
  if (from) params.set("from", `${from}T00:00:00.000Z`);
  if (to) params.set("to", `${to}T23:59:59.999Z`);
  if (from) inventoryParams.set("from", `${from}T00:00:00.000Z`);
  if (to) inventoryParams.set("to", `${to}T23:59:59.999Z`);
  const paymentParams = new URLSearchParams({ page: String(paymentPage), limit: "50", ...(paymentStatus ? { status: paymentStatus } : {}), ...(paymentMethod ? { paymentMethod } : {}) });
  if (from) paymentParams.set("from", `${from}T00:00:00.000Z`);
  if (to) paymentParams.set("to", `${to}T23:59:59.999Z`);
  const report = useQuery({ queryKey: ["admin-order-report", page, from, to], queryFn: () => api.orderReport(params.toString()) });
  const inventory = useQuery({ queryKey: ["admin-product-report", inventoryPage, from, to], queryFn: () => api.productReport(inventoryParams.toString()) });
  const reconciliation = useQuery({ queryKey: ["admin-payment-reconciliation", paymentPage, paymentStatus, paymentMethod, from, to], queryFn: () => api.paymentReconciliation(paymentParams.toString()) });
  const download = async () => {
    try {
      const blob = await api.exportOrderReport(params.toString());
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a"); link.href = url; link.download = `smartcart-orders-page-${page}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not export report"); }
  };
  const downloadInventory = async () => {
    try {
      const blob = await api.exportProductReport(inventoryParams.toString());
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `smartcart-inventory-page-${inventoryPage}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not export inventory report"); }
  };
  const downloadPayments = async () => {
    try {
      const blob = await api.exportPaymentReconciliation(paymentParams.toString());
      const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "smartcart-payment-reconciliation.csv"; link.click(); URL.revokeObjectURL(url);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Could not export payment report"); }
  };
  return <div><p className="text-xs uppercase tracking-[.2em] text-emerald-700">Store operations</p><h1 className="mb-8 mt-2 font-display text-4xl">Reports</h1>
    <section className="mb-6 flex flex-wrap items-end gap-3 rounded-3xl border border-ink/10 p-5"><label className="text-sm">From<input className="field mt-1" type="date" value={from} onChange={(event) => { setFrom(event.target.value); setPage(1); setInventoryPage(1); }} /></label><label className="text-sm">To<input className="field mt-1" type="date" value={to} onChange={(event) => { setTo(event.target.value); setPage(1); setInventoryPage(1); }} /></label><Button type="button" variant="outline" onClick={() => void download()}>Export current order page CSV</Button><Button type="button" variant="outline" onClick={() => void downloadInventory()}>Export current inventory page CSV</Button></section>
    {report.isLoading ? <div className="skeleton h-72 rounded-3xl" /> : report.isError ? <p role="alert">Could not load the report. Refresh and try again.</p> : <>
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{[["Gross merchandise sales", report.data!.summary.grossSales], ["Discounts", report.data!.summary.discounts], ["Taxes collected", report.data!.summary.taxes], ["Shipping collected", report.data!.summary.shipping], ["Refunds", report.data!.summary.refunds], ["Net merchandise sales", report.data!.summary.netSales]].map(([label, value]) => <article key={String(label)} className="rounded-2xl bg-sand p-5"><p className="text-xs uppercase tracking-wider text-ink/45">{label}</p><p className="mt-2 font-display text-2xl">{money(Number(value), currency)}</p></article>)}</div>
      <div className="overflow-x-auto rounded-3xl border border-ink/10"><table className="w-full min-w-[800px] text-left text-sm"><thead className="bg-sand"><tr>{["Order", "Date", "Order status", "Payment", "Subtotal", "Discount", "Total"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{report.data!.orders.map((order) => <tr key={order._id} className="border-t border-ink/10"><td className="px-4 py-3 font-mono text-xs">{order._id}</td><td className="px-4 py-3">{new Date(order.createdAt).toLocaleDateString()}</td><td className="px-4 py-3">{order.orderStatus}</td><td className="px-4 py-3">{order.paymentStatus}</td><td className="px-4 py-3">{money(order.subtotalAmount ?? order.totalAmount, currency)}</td><td className="px-4 py-3">{money(order.discountAmount ?? 0, currency)}</td><td className="px-4 py-3">{money(order.totalAmount, currency)}</td></tr>)}</tbody></table></div>
      <div className="mt-4 flex items-center justify-between text-sm"><span>{report.data!.pagination.total} orders · Page {page} of {Math.max(report.data!.pagination.pages, 1)}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>Previous</Button><Button type="button" variant="outline" disabled={!report.data!.pagination.hasNext} onClick={() => setPage((value) => value + 1)}>Next</Button></div></div>
    </>}
    <section className="mt-14"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[.18em] text-emerald-700">Products and inventory</p><h2 className="mt-2 font-display text-3xl">Inventory report</h2></div></div>
      {inventory.isLoading ? <div className="skeleton h-56 rounded-3xl" /> : inventory.isError ? <p role="alert">Could not load the inventory report.</p> : <>
        <div className="mb-5 grid gap-3 sm:grid-cols-3">{[["Products", inventory.data!.summary.totalProducts], ["Low stock", inventory.data!.summary.lowStock], ["Out of stock", inventory.data!.summary.outOfStock]].map(([label, value]) => <article key={String(label)} className="rounded-2xl bg-sand p-4"><p className="text-xs uppercase tracking-wider text-ink/45">{label}</p><p className="mt-2 font-display text-2xl">{value}</p></article>)}</div>
        <div className="overflow-x-auto rounded-3xl border border-ink/10"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-sand"><tr>{["Product", "SKU", "Category", "Brand", "Price", "Stock", "Updated"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{inventory.data!.items.map((product) => <tr key={product._id} className="border-t border-ink/10"><td className="px-4 py-3">{product.name}</td><td className="px-4 py-3 font-mono text-xs">{product.sku || "—"}</td><td className="px-4 py-3">{product.category}</td><td className="px-4 py-3">{product.brand || "—"}</td><td className="px-4 py-3">{money(product.price, currency)}</td><td className="px-4 py-3">{product.stock}</td><td className="px-4 py-3">{product.updatedAt ? new Date(product.updatedAt).toLocaleDateString() : "—"}</td></tr>)}</tbody></table></div>
        <div className="mt-4 flex items-center justify-between text-sm"><span>{inventory.data!.pagination.total} products · Page {inventoryPage} of {Math.max(inventory.data!.pagination.pages, 1)} · Low stock at or below {inventory.data!.summary.lowStockThreshold}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={inventoryPage <= 1} onClick={() => setInventoryPage((value) => value - 1)}>Previous</Button><Button type="button" variant="outline" disabled={inventoryPage >= inventory.data!.pagination.pages} onClick={() => setInventoryPage((value) => value + 1)}>Next</Button></div></div>
      </>}
    </section>
    <section className="mt-14"><div className="mb-5 flex flex-wrap items-end justify-between gap-3"><div><p className="text-xs uppercase tracking-[.18em] text-emerald-700">Provider records</p><h2 className="mt-2 font-display text-3xl">Payment and refund reconciliation</h2><p className="mt-2 text-sm text-ink/55">Includes provider payment, refund, and transaction references.</p></div><Button type="button" variant="outline" onClick={() => void downloadPayments()}>Export filtered payments CSV</Button></div>
      <div className="mb-5 flex flex-wrap gap-3"><select aria-label="Filter payment status" className="rounded-full border border-ink/15 bg-paper px-4 text-sm" value={paymentStatus} onChange={(event) => { setPaymentStatus(event.target.value); setPaymentPage(1); }}><option value="">All payment statuses</option>{["PENDING", "SUCCESS", "FAILED", "REFUNDED"].map((status) => <option key={status}>{status}</option>)}</select><select aria-label="Filter payment method" className="rounded-full border border-ink/15 bg-paper px-4 text-sm" value={paymentMethod} onChange={(event) => { setPaymentMethod(event.target.value); setPaymentPage(1); }}><option value="">All methods</option>{["UPI", "CARD", "COD"].map((method) => <option key={method}>{method}</option>)}</select></div>
      {reconciliation.isLoading ? <div className="skeleton h-56 rounded-3xl" /> : reconciliation.isError ? <p role="alert">Could not load payment reconciliation data.</p> : <>
        <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Payments", reconciliation.data!.summary.paymentCount], ["Captured", reconciliation.data!.summary.grossAmount], ["Refunded", reconciliation.data!.summary.refundedAmount], ["Pending", reconciliation.data!.summary.pendingAmount]].map(([label, value]) => <article key={String(label)} className="rounded-2xl bg-sand p-4"><p className="text-xs uppercase tracking-wider text-ink/45">{label}</p><p className="mt-2 font-display text-xl">{typeof value === "number" && label !== "Payments" ? money(value, currency) : value}</p></article>)}</div>
        <div className="overflow-x-auto rounded-3xl border border-ink/10"><table className="w-full min-w-[1100px] text-left text-sm"><thead className="bg-sand"><tr>{["Created", "Order", "Payment", "Method", "Amount", "Refunded", "Provider reference", "Transaction", "Refund reference"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{reconciliation.data!.items.map((payment) => <tr key={payment._id} className="border-t border-ink/10"><td className="px-4 py-3 text-xs">{new Date(payment.createdAt).toLocaleDateString()}</td><td className="px-4 py-3 font-mono text-xs">{payment.orderId}</td><td className="px-4 py-3">{payment.status}</td><td className="px-4 py-3">{payment.paymentMethod}</td><td className="px-4 py-3">{money(payment.amount, payment.currency)}</td><td className="px-4 py-3">{money(payment.refundedAmount, payment.currency)}</td><td className="px-4 py-3 font-mono text-xs">{payment.gateway?.paymentIntentId || "—"}</td><td className="px-4 py-3 font-mono text-xs">{payment.transactionId || "—"}</td><td className="px-4 py-3 font-mono text-xs">{payment.refundId || "—"}</td></tr>)}</tbody></table></div>
        <div className="mt-4 flex items-center justify-between text-sm"><span>{reconciliation.data!.pagination.total} payments · Page {paymentPage} of {Math.max(reconciliation.data!.pagination.pages, 1)}</span><div className="flex gap-2"><Button type="button" variant="outline" disabled={paymentPage <= 1} onClick={() => setPaymentPage((value) => value - 1)}>Previous</Button><Button type="button" variant="outline" disabled={!reconciliation.data!.pagination.hasNext} onClick={() => setPaymentPage((value) => value + 1)}>Next</Button></div></div>
      </>}
    </section>
  </div>;
}

export default function AdminReportsPage() { return <AdminShell permission="analytics.read"><Reports /></AdminShell>; }
