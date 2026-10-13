"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Promotion } from "@/lib/types";
import { useStoreCurrency } from "@/lib/use-store-currency";
import { money } from "@/lib/utils";
import { toast } from "sonner";

const localDate = (date: Date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
type PromotionForm = Omit<Promotion, "_id" | "usageCount"> & { productIdsText: string; categoriesText: string };
const blankPromotion = (maxUsageLimit = 1000, defaultPerCustomerLimit = 1): PromotionForm => ({ code: "", description: "", discountType: "PERCENTAGE", discountValue: 10, startsAt: localDate(new Date()), endsAt: localDate(new Date(Date.now() + 7 * 86400000)), minCartValue: 0, maxDiscount: null, usageLimit: maxUsageLimit, perCustomerLimit: defaultPerCustomerLimit, productIds: [], categories: [], status: "DRAFT", productIdsText: "", categoriesText: "" });

function PromotionsAdmin() {
  const currency = useStoreCurrency();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<PromotionForm>(blankPromotion);
  const storeSettings = useQuery({ queryKey: ["public-store-settings"], queryFn: api.publicStoreSettings });
  const createDefaults = storeSettings.data?.promotionDefaults || { maxUsageLimit: 1000, defaultPerCustomerLimit: 1 };
  useEffect(() => { if (!editing && storeSettings.data) setForm((current) => ({ ...current, usageLimit: createDefaults.maxUsageLimit, perCustomerLimit: createDefaults.defaultPerCustomerLimit })); }, [editing, storeSettings.data, createDefaults.maxUsageLimit, createDefaults.defaultPerCustomerLimit]);
  const promotions = useQuery({ queryKey: ["admin-promotions"], queryFn: api.promotions });
  const save = useMutation({
    mutationFn: () => {
      const { productIdsText, categoriesText, ...fields } = form;
      const body = { ...fields, code: form.code.trim().toUpperCase(), startsAt: new Date(form.startsAt).toISOString(), endsAt: new Date(form.endsAt).toISOString(), productIds: productIdsText.split(",").map((value) => value.trim()).filter(Boolean), categories: categoriesText.split(",").map((value) => value.trim()).filter(Boolean) };
      return editing ? api.updatePromotion(editing, body) : api.createPromotion(body);
    },
    onSuccess: () => { toast.success("Promotion saved"); setEditing(null); setForm(blankPromotion(createDefaults.maxUsageLimit, createDefaults.defaultPerCustomerLimit)); void qc.invalidateQueries({ queryKey: ["admin-promotions"] }); },
    onError: (error) => toast.error(error.message || "Could not save promotion"),
  });
  const edit = (promotion: Promotion) => {
    setEditing(promotion._id);
    setForm({ ...promotion, startsAt: localDate(new Date(promotion.startsAt)), endsAt: localDate(new Date(promotion.endsAt)), productIdsText: promotion.productIds.join(", "), categoriesText: promotion.categories.join(", ") });
  };
  const update = (key: string, value: string | number | null) => setForm((current) => ({ ...current, [key]: value }));
  const input = (key: keyof PromotionForm, label: string, type = "text") => <label className="block text-sm">{label}<input className="field mt-1" type={type} value={String(form[key] ?? "")} onChange={(event) => update(key, type === "number" ? (event.target.value === "" ? null : Number(event.target.value)) : event.target.value)} /></label>;

  return <div><p className="text-xs uppercase tracking-[.2em] text-emerald-700">Store operations</p><h1 className="mb-8 mt-2 font-display text-4xl">Promotions</h1>
    <form onSubmit={(event) => { event.preventDefault(); save.mutate(); }} className="mb-8 rounded-3xl border border-ink/10 p-6">
      <h2 className="mb-5 font-display text-2xl">{editing ? "Edit coupon" : "Create coupon"}</h2>
      <div className="grid gap-4 md:grid-cols-3">
        {input("code", "Coupon code")}{input("description", "Description")}
        <label className="block text-sm">Discount type<select className="field mt-1" value={form.discountType} onChange={(event) => update("discountType", event.target.value)}><option value="PERCENTAGE">Percentage</option><option value="FIXED">Fixed amount</option></select></label>
        {input("discountValue", "Discount value", "number")}{input("startsAt", "Starts at", "datetime-local")}{input("endsAt", "Ends at", "datetime-local")}
        {input("minCartValue", "Minimum cart value", "number")}{input("maxDiscount", "Maximum discount (optional)", "number")}{input("usageLimit", "Total use limit", "number")}{input("perCustomerLimit", "Uses per customer", "number")}
        {input("productIdsText", "Product IDs (comma separated, optional)")}{input("categoriesText", "Categories (comma separated, optional)")}
        <label className="block text-sm">Status<select className="field mt-1" value={form.status} onChange={(event) => update("status", event.target.value)}><option value="DRAFT">Draft</option><option value="ACTIVE">Active</option><option value="INACTIVE">Inactive</option></select></label>
      </div>
      <div className="mt-5 flex gap-3"><Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving..." : "Save promotion"}</Button>{editing && <Button type="button" variant="outline" onClick={() => { setEditing(null); setForm(blankPromotion()); }}>Cancel edit</Button>}</div>
    </form>
    {promotions.isLoading ? <div className="skeleton h-56 rounded-3xl" /> : promotions.isError ? <p role="alert">Could not load promotions. Refresh and try again.</p> : <div className="overflow-x-auto rounded-3xl border border-ink/10"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-sand"><tr>{["Code", "Offer", "Dates", "Uses", "Status", ""].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>{promotions.data?.map((promotion) => <tr key={promotion._id} className="border-t border-ink/10"><td className="px-4 py-4 font-semibold">{promotion.code}<p className="text-xs font-normal text-ink/50">{promotion.description}</p></td><td className="px-4 py-4">{promotion.discountType === "PERCENTAGE" ? `${promotion.discountValue}%` : money(promotion.discountValue, currency)}{promotion.maxDiscount ? ` (max ${money(promotion.maxDiscount, currency)})` : ""}</td><td className="px-4 py-4">{new Date(promotion.startsAt).toLocaleDateString()} - {new Date(promotion.endsAt).toLocaleDateString()}</td><td className="px-4 py-4">{promotion.usageCount} / {promotion.usageLimit}</td><td className="px-4 py-4">{new Date(promotion.endsAt) <= new Date() ? "EXPIRED" : promotion.status}</td><td className="px-4 py-4"><Button type="button" variant="outline" onClick={() => edit(promotion)}>Edit</Button></td></tr>)}</tbody></table></div>}
  </div>;
}

export default function AdminPromotionsPage() { return <AdminShell permission="promotions.manage"><PromotionsAdmin /></AdminShell>; }
