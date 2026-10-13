"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Package,
  Heart,
  ShoppingBag,
  Shield,
  LogOut,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  CheckCircle2,
  X,
} from "lucide-react";
import { profileSchema } from "@/lib/schemas";
import { api } from "@/lib/api";
import type { SavedAddress } from "@/lib/types";
import { AuthGate } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { z } from "zod";

type Profile = z.infer<typeof profileSchema>;

const emptyAddressForm = (defaultName = "", defaultPhone = ""): Omit<SavedAddress, "id"> => ({
  label: "Home",
  name: defaultName,
  phone: defaultPhone,
  line1: "",
  city: "",
  region: "",
  postalCode: "",
  country: "India",
  isDefault: false,
});

const roleLabelMap: Record<string, string> = {
  customer: "Customer",
  support: "Customer Support",
  inventory_staff: "Inventory Staff",
  admin: "Store Manager",
  super_admin: "Super Admin",
};

function Account() {
  const router = useRouter();
  const qc = useQueryClient();

  const { data: user, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: api.profile,
  });

  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const [editingAddressId, setEditingAddressId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<Omit<SavedAddress, "id">>(emptyAddressForm());

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Profile>({
    resolver: zodResolver(profileSchema),
  });

  useEffect(() => {
    if (user) {
      reset({
        name: user.name,
        phone: user.phone || "",
      });
    }
  }, [user, reset]);

  const update = useMutation({
    mutationFn: api.updateProfile,
    onSuccess: (value) => {
      qc.setQueryData(["profile"], value);
      void qc.invalidateQueries({ queryKey: ["session"] });
      void qc.invalidateQueries({ queryKey: ["admin-session"] });
      toast.success("Profile updated");
    },
    onError: (err: Error) => toast.error(err.message || "Could not update profile"),
  });

  const saveAddressesMutation = useMutation({
    mutationFn: (nextAddresses: SavedAddress[]) => api.updateProfile({ addresses: nextAddresses }),
    onSuccess: (value) => {
      qc.setQueryData(["profile"], value);
      void qc.invalidateQueries({ queryKey: ["session"] });
      void qc.invalidateQueries({ queryKey: ["admin-session"] });
      setAddressModalOpen(false);
      setEditingAddressId(null);
      toast.success("Saved addresses updated");
    },
    onError: (err: Error) => toast.error(err.message || "Could not save address"),
  });

  const addresses: SavedAddress[] = user?.addresses || [];

  const openAddAddress = () => {
    setEditingAddressId(null);
    setAddressForm({
      ...emptyAddressForm(user?.name || "", user?.phone || ""),
      isDefault: addresses.length === 0,
    });
    setAddressModalOpen(true);
  };

  const openEditAddress = (addr: SavedAddress) => {
    setEditingAddressId(addr.id);
    setAddressForm({
      label: addr.label || "Home",
      name: addr.name || "",
      phone: addr.phone || "",
      line1: addr.line1 || "",
      city: addr.city || "",
      region: addr.region || "",
      postalCode: addr.postalCode || "",
      country: addr.country || "India",
      isDefault: Boolean(addr.isDefault),
    });
    setAddressModalOpen(true);
  };

  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !addressForm.name.trim() ||
      !addressForm.line1.trim() ||
      !addressForm.city.trim() ||
      !addressForm.region.trim() ||
      !addressForm.postalCode.trim() ||
      !addressForm.country.trim()
    ) {
      toast.error("Please fill in all required address fields.");
      return;
    }

    const entry: SavedAddress = {
      id: editingAddressId || globalThis.crypto.randomUUID(),
      label: addressForm.label.trim() || "Home",
      name: addressForm.name.trim(),
      phone: addressForm.phone?.trim() || "",
      line1: addressForm.line1.trim(),
      city: addressForm.city.trim(),
      region: addressForm.region.trim(),
      postalCode: addressForm.postalCode.trim(),
      country: addressForm.country.trim(),
      isDefault: Boolean(addressForm.isDefault),
    };

    let nextList: SavedAddress[];
    if (editingAddressId) {
      nextList = addresses.map((item) => (item.id === editingAddressId ? entry : item));
    } else {
      nextList = [...addresses, entry];
    }

    if (entry.isDefault) {
      nextList = nextList.map((item) => ({
        ...item,
        isDefault: item.id === entry.id,
      }));
    } else if (!nextList.some((item) => item.isDefault) && nextList.length > 0) {
      nextList[0] = { ...nextList[0], isDefault: true };
    }

    saveAddressesMutation.mutate(nextList);
  };

  const handleSetDefaultAddress = (id: string) => {
    const nextList = addresses.map((item) => ({
      ...item,
      isDefault: item.id === id,
    }));
    saveAddressesMutation.mutate(nextList);
  };

  const handleDeleteAddress = (id: string) => {
    const filtered = addresses.filter((item) => item.id !== id);
    if (filtered.length > 0 && !filtered.some((item) => item.isDefault)) {
      filtered[0] = { ...filtered[0], isDefault: true };
    }
    saveAddressesMutation.mutate(filtered);
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    qc.clear();
    const portal =
      user?.role === "super_admin"
        ? "super_admin"
        : user && user.role !== "customer"
        ? "staff"
        : "customer";
    router.replace(`/login?portal=${portal}`);
    router.refresh();
  };

  const isStaff = user && ["admin", "super_admin", "support", "inventory_staff"].includes(user.role);

  return (
    <section className="mx-auto max-w-5xl px-5 py-10 md:px-10 md:py-14">
      {/* Header */}
      <div className="border-b border-ink/10 pb-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                Account Settings
              </span>
              {user?.role && (
                <span className="rounded-full bg-sand px-2.5 py-0.5 text-[11px] font-semibold text-ink/75">
                  {roleLabelMap[user.role] || user.role}
                </span>
              )}
            </div>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
              My Profile & Addresses
            </h1>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={logout}
            className="flex items-center gap-2 text-xs font-medium text-red-600 hover:bg-red-50 hover:text-red-700"
          >
            <LogOut size={14} /> Sign out
          </Button>
        </div>
      </div>

      <div className="mt-8 grid gap-8 md:grid-cols-[1fr_280px]">
        <div className="space-y-8">
          {/* Contact Details form */}
          <div className="rounded-2xl border border-ink/10 bg-sand/20 p-6 md:p-8">
            <h2 className="text-lg font-semibold text-ink">Contact Details</h2>
            <p className="mt-1 text-xs text-ink/60">
              Update your name and phone number for account notifications and deliveries.
            </p>

            <form
              onSubmit={handleSubmit((value) => update.mutate(value))}
              className="mt-6 space-y-5"
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="account-name"
                    className="block text-xs font-semibold uppercase tracking-wider text-ink/70"
                  >
                    Full Name
                  </label>
                  <input
                    id="account-name"
                    {...register("name")}
                    className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 dark:bg-zinc-900"
                    placeholder="Your full name"
                  />
                  {errors.name && (
                    <span role="alert" className="mt-1 block text-xs font-medium text-red-600">
                      {errors.name.message}
                    </span>
                  )}
                </div>

                <div>
                  <label
                    htmlFor="account-phone"
                    className="block text-xs font-semibold uppercase tracking-wider text-ink/70"
                  >
                    Phone Number
                  </label>
                  <input
                    id="account-phone"
                    {...register("phone")}
                    className="mt-1.5 w-full rounded-xl border border-ink/15 bg-white px-4 py-2.5 text-sm text-ink outline-none transition focus:border-emerald-700 focus:ring-1 focus:ring-emerald-700 dark:bg-zinc-900"
                    placeholder="+91 98765 43210"
                  />
                  {errors.phone && (
                    <span role="alert" className="mt-1 block text-xs font-medium text-red-600">
                      {errors.phone.message}
                    </span>
                  )}
                </div>
              </div>

              <div>
                <label
                  htmlFor="account-email"
                  className="block text-xs font-semibold uppercase tracking-wider text-ink/70"
                >
                  Email Address
                </label>
                <input
                  id="account-email"
                  value={user?.email || ""}
                  disabled
                  className="mt-1.5 w-full cursor-not-allowed rounded-xl border border-ink/10 bg-sand/50 px-4 py-2.5 text-sm text-ink/60 outline-none"
                />
              </div>

              <div className="pt-1">
                <Button
                  type="submit"
                  disabled={update.isPending || isLoading}
                  className="rounded-xl bg-emerald-800 px-6 text-xs font-semibold text-white shadow-xs hover:bg-emerald-900"
                >
                  {update.isPending ? "Saving..." : "Save Contact Details"}
                </Button>
              </div>
            </form>
          </div>

          {/* Saved Addresses section (All Roles) */}
          <div className="rounded-2xl border border-ink/10 bg-sand/20 p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-ink">Saved Addresses</h2>
                <p className="mt-1 text-xs text-ink/60">
                  Add multiple addresses for home, office, or store locations.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                onClick={openAddAddress}
                className="flex items-center gap-1.5 rounded-xl bg-emerald-800 px-4 text-xs font-semibold text-white hover:bg-emerald-900"
              >
                <Plus size={15} /> Add New Address
              </Button>
            </div>

            {isLoading ? (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                <div className="skeleton h-36 rounded-2xl" />
                <div className="skeleton h-36 rounded-2xl" />
              </div>
            ) : addresses.length === 0 ? (
              <div className="mt-6 rounded-2xl border border-dashed border-ink/15 bg-paper/70 p-8 text-center">
                <MapPin size={26} className="mx-auto text-ink/35" />
                <p className="mt-2 text-sm font-semibold text-ink">No addresses saved yet</p>
                <p className="mt-1 text-xs text-ink/55">
                  Save your delivery or office addresses here for quick selection at checkout.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openAddAddress}
                  className="mt-4"
                >
                  + Add Your First Address
                </Button>
              </div>
            ) : (
              <div className="mt-6 grid gap-4 sm:grid-cols-2">
                {addresses.map((addr) => (
                  <article
                    key={addr.id}
                    className={`flex flex-col justify-between rounded-2xl border p-5 transition ${
                      addr.isDefault
                        ? "border-emerald-700/60 bg-emerald-50/30 dark:bg-emerald-950/15"
                        : "border-ink/10 bg-paper"
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-sand px-2.5 py-0.5 text-[11px] font-semibold text-ink/80">
                          <MapPin size={11} className="text-emerald-700" />
                          {addr.label || "Address"}
                        </span>
                        {addr.isDefault && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-800">
                            <CheckCircle2 size={11} /> Default
                          </span>
                        )}
                      </div>

                      <p className="mt-3 text-sm font-semibold text-ink">{addr.name}</p>
                      <p className="mt-1 text-xs leading-relaxed text-ink/70">
                        {addr.line1}
                        <br />
                        {addr.city}, {addr.region} {addr.postalCode}
                        <br />
                        {addr.country}
                      </p>
                      {addr.phone && (
                        <p className="mt-1.5 text-xs text-ink/55">Phone: {addr.phone}</p>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink/10 pt-3 text-xs">
                      <button
                        type="button"
                        onClick={() => openEditAddress(addr)}
                        className="inline-flex items-center gap-1 font-semibold text-ink/75 hover:text-emerald-800"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                      {!addr.isDefault && (
                        <button
                          type="button"
                          disabled={saveAddressesMutation.isPending}
                          onClick={() => handleSetDefaultAddress(addr.id)}
                          className="font-semibold text-emerald-800 hover:underline"
                        >
                          Set as default
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={saveAddressesMutation.isPending}
                        onClick={() => handleDeleteAddress(addr.id)}
                        className="ml-auto inline-flex items-center gap-1 font-semibold text-red-600 hover:text-red-700"
                      >
                        <Trash2 size={12} /> Remove
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Side quick navigation */}
        <aside className="space-y-3">
          {isStaff && (
            <Link
              href={user?.role === "super_admin" ? "/super-admin/dashboard" : "/admin/orders"}
              className="flex items-center gap-3.5 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900 transition hover:bg-emerald-100"
            >
              <Shield size={20} className="shrink-0 text-emerald-700" />
              <div>
                <p className="text-sm font-bold">
                  {user?.role === "super_admin" ? "Super Admin Portal" : "Staff Dashboard"}
                </p>
                <p className="text-xs text-emerald-700">Manage orders, stock & catalog</p>
              </div>
            </Link>
          )}

          <Link
            href="/orders"
            className="flex items-center gap-3.5 rounded-2xl border border-ink/10 bg-sand/30 p-4 transition hover:border-ink/20 hover:bg-sand/50"
          >
            <Package size={20} className="shrink-0 text-ink/70" />
            <div>
              <p className="text-sm font-bold text-ink">My Orders</p>
              <p className="text-xs text-ink/60">Track shipments and order history</p>
            </div>
          </Link>

          <Link
            href="/wishlist"
            className="flex items-center gap-3.5 rounded-2xl border border-ink/10 bg-sand/30 p-4 transition hover:border-ink/20 hover:bg-sand/50"
          >
            <Heart size={20} className="shrink-0 text-ink/70" />
            <div>
              <p className="text-sm font-bold text-ink">My Wishlist</p>
              <p className="text-xs text-ink/60">View saved products</p>
            </div>
          </Link>

          <Link
            href="/cart"
            className="flex items-center gap-3.5 rounded-2xl border border-ink/10 bg-sand/30 p-4 transition hover:border-ink/20 hover:bg-sand/50"
          >
            <ShoppingBag size={20} className="shrink-0 text-ink/70" />
            <div>
              <p className="text-sm font-bold text-ink">Shopping Cart</p>
              <p className="text-xs text-ink/60">Checkout pending items</p>
            </div>
          </Link>
        </aside>
      </div>

      {/* Add / Edit Address Modal */}
      {addressModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-paper p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-ink/10 pb-3">
              <h3 className="font-display text-xl font-semibold text-ink">
                {editingAddressId ? "Edit Address" : "Add New Address"}
              </h3>
              <button
                type="button"
                onClick={() => setAddressModalOpen(false)}
                className="rounded-full p-1 text-ink/50 hover:bg-black/5"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveAddress} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-ink/70">
                  Address Label
                </label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {["Home", "Work", "Office", "Warehouse", "Other"].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAddressForm({ ...addressForm, label: preset })}
                      className={`rounded-full border px-3.5 py-1 text-xs font-semibold transition ${
                        addressForm.label === preset
                          ? "border-emerald-700 bg-emerald-800 text-white"
                          : "border-ink/15 bg-sand/40 text-ink/75 hover:border-ink/30"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-ink/75">
                    Recipient Name *
                  </label>
                  <input
                    required
                    value={addressForm.name}
                    onChange={(e) => setAddressForm({ ...addressForm, name: e.target.value })}
                    placeholder="Full name"
                    className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2 text-xs text-ink outline-none focus:border-emerald-700 dark:bg-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink/75">
                    Phone Number
                  </label>
                  <input
                    value={addressForm.phone || ""}
                    onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })}
                    placeholder="+91 98765 43210"
                    className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2 text-xs text-ink outline-none focus:border-emerald-700 dark:bg-zinc-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink/75">
                  Street Address / Building / Apartment *
                </label>
                <input
                  required
                  value={addressForm.line1}
                  onChange={(e) => setAddressForm({ ...addressForm, line1: e.target.value })}
                  placeholder="House/Flat No., Building, Street, Area"
                  className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2 text-xs text-ink outline-none focus:border-emerald-700 dark:bg-zinc-900"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <label className="block text-xs font-semibold text-ink/75">City *</label>
                  <input
                    required
                    value={addressForm.city}
                    onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })}
                    placeholder="Mumbai"
                    className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2 text-xs text-ink outline-none focus:border-emerald-700 dark:bg-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink/75">State *</label>
                  <input
                    required
                    value={addressForm.region}
                    onChange={(e) => setAddressForm({ ...addressForm, region: e.target.value })}
                    placeholder="Maharashtra"
                    className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2 text-xs text-ink outline-none focus:border-emerald-700 dark:bg-zinc-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-ink/75">
                    PIN / Postal Code *
                  </label>
                  <input
                    required
                    value={addressForm.postalCode}
                    onChange={(e) => setAddressForm({ ...addressForm, postalCode: e.target.value })}
                    placeholder="400001"
                    className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2 text-xs text-ink outline-none focus:border-emerald-700 dark:bg-zinc-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink/75">Country *</label>
                <input
                  required
                  value={addressForm.country}
                  onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })}
                  placeholder="India"
                  className="mt-1 w-full rounded-xl border border-ink/15 bg-white px-3.5 py-2 text-xs text-ink outline-none focus:border-emerald-700 dark:bg-zinc-900"
                />
              </div>

              <label className="flex items-center gap-2.5 pt-1 text-xs font-medium text-ink/80">
                <input
                  type="checkbox"
                  checked={Boolean(addressForm.isDefault)}
                  onChange={(e) =>
                    setAddressForm({ ...addressForm, isDefault: e.target.checked })
                  }
                />
                Set as my default address
              </label>

              <div className="flex justify-end gap-2 border-t border-ink/10 pt-4">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setAddressModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={saveAddressesMutation.isPending}
                  className="bg-emerald-800 text-white hover:bg-emerald-900"
                >
                  {saveAddressesMutation.isPending
                    ? "Saving..."
                    : editingAddressId
                    ? "Update Address"
                    : "Save Address"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

export default function AccountPage() {
  return (
    <AuthGate>
      <Account />
    </AuthGate>
  );
}
