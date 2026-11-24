"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { StoreSettings } from "@/lib/types";
import { toast } from "sonner";

const defaults: StoreSettings = { storeName: "SmartCart", logoUrl: "", currency: "INR", taxRate: 0, shippingFee: 0, freeShippingThreshold: 0, lowStockThreshold: 5, returnPolicy: "", notificationPreferences: { orderConfirmation: true, shipmentUpdates: true, returnUpdates: true }, promotionDefaults: { maxUsageLimit: 1000, defaultPerCustomerLimit: 1 } };

function SettingsForm() {
  const qc = useQueryClient();
  const settings = useQuery({ queryKey: ["store-settings"], queryFn: api.storeSettings });
  const [form, setForm] = useState<StoreSettings>(defaults);
  useEffect(() => { if (settings.data) setForm(settings.data); }, [settings.data]);
  const save = useMutation({ mutationFn: () => api.updateStoreSettings(form), onSuccess: (value) => { setForm(value); toast.success("Store settings saved"); void qc.invalidateQueries({ queryKey: ["store-settings"] }); }, onError: (error) => toast.error(error.message || "Could not save settings") });
  const field = (key: "storeName" | "logoUrl" | "taxRate" | "shippingFee" | "freeShippingThreshold" | "lowStockThreshold", label: string, type = "text") => <label className="block text-sm">{label}<input className="field mt-1" type={type} value={form[key]} onChange={(event) => setForm({ ...form, [key]: type === "number" ? Number(event.target.value) : event.target.value })} /></label>;
  const checkbox = (key: keyof StoreSettings["notificationPreferences"], label: string) => <label className="flex items-center gap-3 text-sm"><input type="checkbox" checked={form.notificationPreferences[key]} onChange={(event) => setForm({ ...form, notificationPreferences: { ...form.notificationPreferences, [key]: event.target.checked } })} />{label}</label>;
  return <div><p className="text-xs uppercase tracking-[.2em] text-emerald-700">Store operations</p><h1 className="mb-8 mt-2 font-display text-4xl">Store settings</h1>
    {settings.isLoading ? <div className="skeleton h-96 rounded-3xl" /> : settings.isError ? <p role="alert">Could not load store settings. Refresh and try again.</p> : <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }} className="space-y-6">
      <section className="rounded-3xl border border-ink/10 p-6"><h2 className="mb-5 font-display text-2xl">Store identity & pricing defaults</h2><div className="grid gap-4 md:grid-cols-2">{field("storeName", "Store name")}{field("logoUrl", "Logo URL (HTTPS)")}<label className="block text-sm">Currency<select className="field mt-1" value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value as StoreSettings["currency"] })}><option value="INR">INR (₹)</option><option value="USD">USD ($)</option><option value="EUR">EUR (€)</option></select></label>{field("taxRate", "Tax rate (%)", "number")}{field("shippingFee", "Standard shipping fee", "number")}{field("freeShippingThreshold", "Free shipping threshold", "number")}{field("lowStockThreshold", "Low stock alert threshold", "number")}</div><p className="mt-4 text-xs text-ink/50">Currency, tax, and shipping rates apply across product listings and checkout.</p></section>
      <section className="rounded-3xl border border-ink/10 p-6"><h2 className="mb-4 font-display text-2xl">Return policy</h2><textarea className="field min-h-32" maxLength={5000} value={form.returnPolicy} onChange={(event) => setForm({ ...form, returnPolicy: event.target.value })} /></section>
      <section className="rounded-3xl border border-ink/10 p-6"><h2 className="mb-4 font-display text-2xl">Customer email notifications</h2><div className="grid gap-3 sm:grid-cols-3">{checkbox("orderConfirmation", "Order confirmations")}{checkbox("shipmentUpdates", "Shipping & delivery updates")}{checkbox("returnUpdates", "Return & refund updates")}</div><p className="mt-4 text-xs text-ink/50">Choose which automated order updates are emailed to customers. Account security emails are always sent.</p></section>
      <section className="rounded-3xl border border-ink/10 p-6"><h2 className="mb-4 font-display text-2xl">Coupon defaults</h2><div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm">Maximum total redemptions<input className="field mt-1" type="number" min="1" max="10000" value={form.promotionDefaults.maxUsageLimit} onChange={(event) => setForm({ ...form, promotionDefaults: { ...form.promotionDefaults, maxUsageLimit: Number(event.target.value) } })} /></label><label className="block text-sm">Default limit per customer<input className="field mt-1" type="number" min="1" max={form.promotionDefaults.maxUsageLimit} value={form.promotionDefaults.defaultPerCustomerLimit} onChange={(event) => setForm({ ...form, promotionDefaults: { ...form.promotionDefaults, defaultPerCustomerLimit: Number(event.target.value) } })} /></label></div><p className="mt-4 text-xs text-ink/50">Default redemption limits used when creating new promotional codes.</p></section>
      <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save settings"}</Button>
    </form>}
  </div>;
}

export default function AdminSettingsPage() { return <AdminShell permission="settings.manage"><SettingsForm /></AdminShell>; }
