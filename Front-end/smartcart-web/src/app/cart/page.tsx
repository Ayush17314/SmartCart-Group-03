"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Minus, Plus, Trash2, ArrowRight, ShoppingBag, ShieldCheck, Truck, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { useStoreCurrency } from "@/lib/use-store-currency";
import { money, imageFor } from "@/lib/utils";
import { AuthGate } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";

function CartContents() {
  const currency = useStoreCurrency();
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: ["cart"],
    queryFn: api.cart,
  });

  const change = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) =>
      qty ? api.updateCart(id, qty) : api.removeCart(id),
    onMutate: async ({ id, qty }) => {
      await qc.cancelQueries({ queryKey: ["cart"] });
      const prev = qc.getQueryData<Awaited<ReturnType<typeof api.cart>>>(["cart"]);
      if (prev) {
        qc.setQueryData(["cart"], {
          ...prev,
          items: qty
            ? prev.items.map((x) => (x.productId === id ? { ...x, quantity: qty } : x))
            : prev.items.filter((x) => x.productId !== id),
          total: prev.items.reduce(
            (s, x) => s + x.price * (x.productId === id ? qty : x.quantity),
            0
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, c) => {
      qc.setQueryData(["cart"], c?.prev);
      toast.error("Could not update item quantity");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["cart"] }),
  });

  const clear = useMutation({
    mutationFn: api.clearCart,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      toast.success("Cart cleared");
    },
    onError: () => toast.error("Could not clear cart"),
  });

  const itemCount = data?.items?.reduce((s, x) => s + x.quantity, 0) || 0;

  return (
    <section className="mx-auto max-w-6xl px-5 py-10 md:px-10 md:py-14">
      {/* Header */}
      <div className="flex flex-wrap items-baseline justify-between gap-4 border-b border-ink/10 pb-6">
        <div>
          <h1 className="font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Shopping Cart
          </h1>
          <p className="mt-1 text-xs text-ink/60">
            {itemCount} {itemCount === 1 ? "item" : "items"} ready for order
          </p>
        </div>
        {!!data?.items.length && (
          <button
            onClick={() => clear.mutate()}
            disabled={clear.isPending}
            className="text-xs font-semibold text-red-600 hover:text-red-700 underline"
          >
            Clear entire cart
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="mt-8 space-y-4">
          <div className="skeleton h-24 rounded-2xl" />
          <div className="skeleton h-24 rounded-2xl" />
        </div>
      ) : error ? (
        <div role="alert" className="mt-8 rounded-2xl border border-red-100 bg-red-50 p-8 text-center">
          <p className="font-semibold text-red-800">Your cart could not be loaded.</p>
          <Button
            variant="outline"
            className="mt-4"
            onClick={() => qc.invalidateQueries({ queryKey: ["cart"] })}
          >
            Try Again
          </Button>
        </div>
      ) : !data?.items.length ? (
        <div className="mt-10 rounded-3xl border border-ink/10 bg-sand/30 p-12 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sand text-ink/40">
            <ShoppingBag size={32} />
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold text-ink">Your cart is empty</h2>
          <p className="mt-1 text-sm text-ink/60">Explore our catalog and find great deals today.</p>
          <Button asChild className="mt-6 rounded-full px-8">
            <Link href="/products">Browse All Products</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_360px]">
          {/* Items list */}
          <div className="space-y-4">
            {data.items.map((item) => (
              <article
                key={item.productId}
                className="flex flex-col gap-4 rounded-2xl border border-ink/10 bg-sand/20 p-4 sm:flex-row sm:items-center sm:gap-6"
              >
                <img
                  src={item.image || imageFor()}
                  alt={item.name}
                  className="h-28 w-24 shrink-0 rounded-xl object-cover bg-sand/40"
                />

                <div className="flex flex-1 flex-col justify-between">
                  <div>
                    <Link
                      href={`/products/${item.productId}`}
                      className="font-semibold text-base text-ink hover:text-emerald-700 transition"
                    >
                      {item.name}
                    </Link>
                    <p className="mt-1 text-xs text-ink/50">Unit price: {money(item.price, currency)}</p>
                  </div>

                  <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center rounded-lg border border-ink/15 bg-white px-2 py-0.5 shadow-2xs">
                      <button
                        aria-label="Decrease quantity"
                        onClick={() =>
                          change.mutate({ id: item.productId, qty: item.quantity - 1 })
                        }
                        className="p-1 text-ink/60 hover:text-ink"
                      >
                        <Minus size={14} />
                      </button>
                      <span className="w-8 text-center text-xs font-semibold">{item.quantity}</span>
                      <button
                        aria-label="Increase quantity"
                        onClick={() =>
                          change.mutate({ id: item.productId, qty: item.quantity + 1 })
                        }
                        className="p-1 text-ink/60 hover:text-ink"
                      >
                        <Plus size={14} />
                      </button>
                    </div>

                    <button
                      className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                      aria-label="Remove item"
                      onClick={() => change.mutate({ id: item.productId, qty: 0 })}
                    >
                      <Trash2 size={14} /> Remove
                    </button>
                  </div>
                </div>

                <div className="sm:text-right">
                  <p className="text-base font-bold text-ink">
                    {money(item.price * item.quantity, currency)}
                  </p>
                </div>
              </article>
            ))}
          </div>

          {/* Order Summary Box */}
          <aside className="h-fit rounded-2xl border border-ink/10 bg-sand/30 p-6 space-y-6">
            <h2 className="font-display text-xl font-semibold text-ink">Order Summary</h2>

            <div className="space-y-3 text-sm border-b border-ink/10 pb-4">
              <div className="flex justify-between text-ink/70">
                <span>Items ({itemCount})</span>
                <span className="font-medium text-ink">{money(data.total, currency)}</span>
              </div>
              <div className="flex justify-between text-ink/70">
                <span>Delivery</span>
                <span className="font-medium text-emerald-700">Calculated at checkout</span>
              </div>
            </div>

            <div className="flex justify-between text-base font-bold text-ink">
              <span>Estimated Total</span>
              <span className="text-emerald-800">{money(data.total, currency)}</span>
            </div>

            <Button asChild className="w-full h-12 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-sm font-semibold shadow-xs">
              <Link href="/checkout">
                Proceed to Checkout <ArrowRight size={16} className="ml-2" />
              </Link>
            </Button>

            <div className="space-y-2.5 pt-2 text-xs text-ink/65">
              <div className="flex items-center gap-2">
                <ShieldCheck size={16} className="text-emerald-700 shrink-0" />
                <span>100% Secure Checkout via Razorpay & UPI</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck size={16} className="text-emerald-700 shrink-0" />
                <span>Free delivery on qualifying orders</span>
              </div>
              <div className="flex items-center gap-2">
                <RotateCcw size={16} className="text-emerald-700 shrink-0" />
                <span>7-Day Return and Replacement Policy</span>
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

export default function CartPage() {
  return (
    <AuthGate>
      <CartContents />
    </AuthGate>
  );
}
