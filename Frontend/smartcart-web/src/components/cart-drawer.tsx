"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { Minus, Plus, ShoppingBag, Trash2, X, ArrowRight, ShieldCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useStoreCurrency } from "@/lib/use-store-currency";
import { money, imageFor } from "@/lib/utils";
import { useUI } from "@/store/ui";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function CartDrawer() {
  const currency = useStoreCurrency();
  const { cartOpen, setCartOpen } = useUI();
  const client = useQueryClient();

  const { data } = useQuery({
    queryKey: ["cart"],
    queryFn: api.cart,
    enabled: cartOpen,
    retry: false,
  });

  const mutation = useMutation({
    mutationFn: ({ id, qty }: { id: string; qty: number }) =>
      qty === 0 ? api.removeCart(id) : api.updateCart(id, qty),
    onMutate: async ({ id, qty }) => {
      await client.cancelQueries({ queryKey: ["cart"] });
      const prev = client.getQueryData<Awaited<ReturnType<typeof api.cart>>>(["cart"]);
      if (prev) {
        client.setQueryData(["cart"], {
          ...prev,
          items:
            qty === 0
              ? prev.items.filter((x) => x.productId !== id)
              : prev.items.map((x) => (x.productId === id ? { ...x, quantity: qty } : x)),
          total: prev.items.reduce(
            (s, x) => s + x.price * (x.productId === id ? qty : x.quantity),
            0
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      client.setQueryData(["cart"], ctx?.prev);
      toast.error("Could not update item quantity");
    },
    onSettled: () => client.invalidateQueries({ queryKey: ["cart"] }),
  });

  const itemCount = data?.items?.reduce((acc, item) => acc + item.quantity, 0) || 0;

  return (
    <AnimatePresence>
      {cartOpen && (
        <>
          <motion.button
            aria-label="Close cart"
            className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCartOpen(false)}
          />

          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Your shopping cart"
            className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col bg-paper p-6 shadow-2xl transition"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-ink/10 pb-4">
              <div>
                <h2 className="text-xl font-display font-semibold tracking-tight text-ink">
                  Shopping Cart
                </h2>
                <p className="text-xs text-ink/50 mt-0.5">
                  {itemCount} {itemCount === 1 ? "item" : "items"} in your cart
                </p>
              </div>
              <button
                onClick={() => setCartOpen(false)}
                aria-label="Close cart"
                className="rounded-full p-2 text-ink/60 hover:bg-black/5 hover:text-ink"
              >
                <X size={20} />
              </button>
            </div>

            {/* Cart Items List */}
            <div className="flex-1 overflow-y-auto py-4">
              {data?.items.length ? (
                <div className="space-y-4">
                  {data.items.map((item) => (
                    <div
                      key={item.productId}
                      className="flex gap-4 rounded-xl border border-ink/5 bg-sand/20 p-3"
                    >
                      <img
                        className="h-20 w-18 rounded-lg object-cover bg-sand/40"
                        src={item.image || imageFor()}
                        alt={item.name}
                      />
                      <div className="flex flex-1 flex-col justify-between">
                        <div>
                          <p className="line-clamp-1 font-semibold text-sm text-ink">{item.name}</p>
                          <p className="mt-0.5 text-xs font-medium text-emerald-800">
                            {money(item.price, currency)}
                          </p>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          <div className="flex items-center rounded-lg border border-ink/15 bg-white px-2 py-0.5 shadow-2xs">
                            <button
                              aria-label="Decrease quantity"
                              onClick={() =>
                                mutation.mutate({ id: item.productId, qty: item.quantity - 1 })
                              }
                              className="p-1 text-ink/60 hover:text-ink"
                            >
                              <Minus size={13} />
                            </button>
                            <span className="w-7 text-center text-xs font-semibold">{item.quantity}</span>
                            <button
                              aria-label="Increase quantity"
                              onClick={() =>
                                mutation.mutate({ id: item.productId, qty: item.quantity + 1 })
                              }
                              className="p-1 text-ink/60 hover:text-ink"
                            >
                              <Plus size={13} />
                            </button>
                          </div>

                          <button
                            aria-label="Remove item"
                            className="rounded-md p-1.5 text-ink/40 hover:bg-red-50 hover:text-red-600 transition"
                            onClick={() => mutation.mutate({ id: item.productId, qty: 0 })}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="grid h-full place-content-center text-center p-6">
                  <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-sand/60 text-ink/40">
                    <ShoppingBag size={28} />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-ink">Your cart is empty</h3>
                  <p className="mt-1 text-xs text-ink/55">
                    Explore our trending deals and add items to your cart.
                  </p>
                  <Button
                    asChild
                    className="mt-5 rounded-full"
                    onClick={() => setCartOpen(false)}
                  >
                    <Link href="/products">Start Shopping</Link>
                  </Button>
                </div>
              )}
            </div>

            {/* Footer / Checkout */}
            {!!data?.items.length && (
              <div className="border-t border-ink/10 pt-4 space-y-3">
                <div className="flex justify-between text-sm font-semibold text-ink">
                  <span>Subtotal</span>
                  <span className="text-base text-emerald-800">{money(data.total, currency)}</span>
                </div>
                <p className="text-[11px] text-ink/50 flex items-center gap-1.5">
                  <ShieldCheck size={14} className="text-emerald-700" />
                  Taxes and coupons calculated at checkout
                </p>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <Button
                    asChild
                    variant="outline"
                    className="rounded-xl text-xs"
                    onClick={() => setCartOpen(false)}
                  >
                    <Link href="/cart">View Cart</Link>
                  </Button>
                  <Button
                    asChild
                    className="rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-xs font-semibold shadow-xs"
                    onClick={() => setCartOpen(false)}
                  >
                    <Link href="/checkout">
                      Checkout <ArrowRight size={14} className="ml-1" />
                    </Link>
                  </Button>
                </div>
              </div>
            )}
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
