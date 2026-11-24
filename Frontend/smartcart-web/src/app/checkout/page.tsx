"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ShieldCheck, CreditCard, Banknote, Smartphone, ShoppingBag } from "lucide-react";
import { checkoutSchema } from "@/lib/schemas";
import { api } from "@/lib/api";
import { loadRazorpay, openRazorpayCheckout } from "@/lib/razorpay";
import { money } from "@/lib/utils";
import { AuthGate } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { z } from "zod";
import { useEffect, useState } from "react";
import type { SavedAddress } from "@/lib/types";

type Checkout = z.infer<typeof checkoutSchema>;

function CheckoutForm() {
  const [couponCode, setCouponCode] = useState("");
  const [selectedAddressId, setSelectedAddressId] = useState<string>("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    subtotal: number;
    discountAmount: number;
    taxAmount: number;
    shippingAmount: number;
    totalAmount: number;
    currency: "INR" | "USD" | "EUR";
  } | null>(null);
  const router = useRouter();
  const qc = useQueryClient();
  const { data: cart, isLoading } = useQuery({ queryKey: ["cart"], queryFn: api.cart });
  const { data: user } = useQuery({ queryKey: ["profile"], queryFn: api.profile });
  const orderQuote = useQuery({
    queryKey: [
      "checkout-order-quote",
      cart?.items.map(({ productId, quantity }) => [productId, quantity]),
    ],
    queryFn: () =>
      api.quoteOrder({
        items: (cart?.items || []).map(({ productId, quantity }) => ({ productId, quantity })),
      }),
    enabled: Boolean(cart?.items.length),
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<Checkout>({
    resolver: zodResolver(checkoutSchema),
    defaultValues: { country: "India", paymentMethod: "UPI" },
  });

  const selectSavedAddress = (addr: SavedAddress) => {
    setSelectedAddressId(addr.id);
    setValue("name", addr.name, { shouldValidate: true });
    setValue("line1", addr.line1, { shouldValidate: true });
    setValue("city", addr.city, { shouldValidate: true });
    setValue("region", addr.region, { shouldValidate: true });
    setValue("postalCode", addr.postalCode, { shouldValidate: true });
    setValue("country", addr.country || "India", { shouldValidate: true });
  };

  useEffect(() => {
    if (user?.addresses?.length && !selectedAddressId) {
      const def = user.addresses.find((a) => a.isDefault) || user.addresses[0];
      if (def) selectSavedAddress(def);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.addresses]);

  const selectedMethod = watch("paymentMethod");

  const order = useMutation({
    mutationFn: (values: Checkout) =>
      api.createOrder({
        items: (cart?.items || []).map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
        })),
        shippingAddress: {
          name: values.name,
          line1: values.line1,
          city: values.city,
          region: values.region,
          postalCode: values.postalCode,
          country: values.country,
        },
        paymentMethod: values.paymentMethod,
        couponCode: appliedCoupon?.code,
      }),
    onSuccess: async (result, values) => {
      if (values.paymentMethod === "COD") {
        await api.clearCart().catch(() => null);
        await qc.invalidateQueries({ queryKey: ["cart"] });
        toast.success("Order placed successfully!");
        router.push(`/orders/${result._id}`);
        return;
      }

      const checkout = result.paymentCheckout;
      if (!checkout || !result.paymentId) {
        toast.error("Your order was created. Please complete payment from the order details page.");
        router.push(`/orders/${result._id}`);
        return;
      }

      try {
        await loadRazorpay();
        const paymentWindow = openRazorpayCheckout(
          checkout,
          async (response) => {
            try {
              const verification = await api.verifyPayment(result.paymentId!, {
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              });
              if (verification.payment.status !== "SUCCESS") {
                toast.message("Payment is being processed. Your order status will update shortly.");
                router.push(`/orders/${result._id}`);
                return;
              }
              await api.clearCart().catch(() => null);
              await qc.invalidateQueries({ queryKey: ["cart"] });
              toast.success("Payment verified and order confirmed!");
              router.push(`/orders/${result._id}`);
            } catch (error) {
              toast.error(error instanceof Error ? error.message : "Could not verify payment");
              router.push(`/orders/${result._id}`);
            }
          },
          values.name,
          () => toast.message("Payment window closed. You can complete payment from your order page.")
        );
        paymentWindow.on("payment.failed", () =>
          toast.error("Payment failed. You can retry anytime from your order page.")
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not open payment checkout");
        router.push(`/orders/${result._id}`);
      }
    },
    onError: (error) => toast.error(error.message || "Could not place order"),
  });

  const promotion = useMutation({
    mutationFn: () =>
      api.applyPromotion({
        items: (cart?.items || []).map(({ productId, quantity }) => ({ productId, quantity })),
        code: couponCode,
      }),
    onSuccess: (quote) => {
      setAppliedCoupon(quote);
      setCouponCode(quote.code);
      toast.success(`Coupon ${quote.code} applied!`);
    },
    onError: (error) => {
      setAppliedCoupon(null);
      toast.error(error.message || "Invalid or expired coupon code");
    },
  });

  if (isLoading) return <div className="skeleton h-72 rounded-3xl" />;

  if (!cart?.items.length) {
    return (
      <div className="rounded-3xl border border-ink/10 bg-sand/30 p-12 text-center max-w-lg mx-auto">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sand text-ink/40">
          <ShoppingBag size={30} />
        </div>
        <h2 className="mt-4 font-display text-2xl font-semibold text-ink">Your cart is empty</h2>
        <p className="mt-1 text-sm text-ink/60">Add items to your cart before proceeding to checkout.</p>
        <Button asChild className="mt-6 rounded-full px-8">
          <Link href="/products">Continue Shopping</Link>
        </Button>
      </div>
    );
  }

  const field = (key: keyof Checkout, label: string, placeholder?: string) => (
    <label className="block text-xs font-semibold text-ink/80">
      {label}
      <input {...register(key)} className="field" placeholder={placeholder} />
      {errors[key] && (
        <span role="alert" className="mt-1 block text-xs font-normal text-red-700">
          {errors[key]?.message}
        </span>
      )}
    </label>
  );

  const activeQuote = appliedCoupon ?? orderQuote.data;

  return (
    <form
      onSubmit={handleSubmit((values) => order.mutate(values))}
      className="grid gap-8 lg:grid-cols-[1fr_380px]"
    >
      <div className="space-y-6">
        {/* Step 1: Shipping Address */}
        <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-2xs md:p-8 dark:bg-zinc-900">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2 border-b border-ink/10 pb-4">
            <div>
              <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
                1. Delivery Details
              </span>
              <h2 className="mt-1 font-display text-2xl font-semibold text-ink">Shipping Address</h2>
            </div>
            <Link
              href="/account"
              className="text-xs font-semibold text-emerald-800 hover:underline"
            >
              Manage saved addresses →
            </Link>
          </div>

          {user?.addresses && user.addresses.length > 0 && (
            <div className="mb-6">
              <p className="mb-2.5 text-xs font-semibold uppercase tracking-wider text-ink/60">
                Select a Saved Address
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {user.addresses.map((addr) => {
                  const active = selectedAddressId === addr.id;
                  return (
                    <button
                      key={addr.id}
                      type="button"
                      onClick={() => selectSavedAddress(addr)}
                      className={`flex flex-col items-start rounded-xl border p-3.5 text-left text-xs transition ${
                        active
                          ? "border-emerald-700 bg-emerald-50/50 ring-1 ring-emerald-700 dark:bg-emerald-950/20"
                          : "border-ink/15 hover:border-ink/30"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between gap-2">
                        <span className="rounded-full bg-sand px-2 py-0.5 text-[10px] font-semibold text-ink/80">
                          {addr.label || "Address"}
                        </span>
                        {addr.isDefault && (
                          <span className="text-[10px] font-semibold text-emerald-800">Default</span>
                        )}
                      </div>
                      <p className="mt-2 font-semibold text-ink">{addr.name}</p>
                      <p className="mt-0.5 line-clamp-2 text-ink/65">
                        {addr.line1}, {addr.city}, {addr.region} {addr.postalCode}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            {field("name", "Recipient full name", "e.g., Rahul Sharma")}
            {field("line1", "Street address / Flat / House No.", "e.g., 42 MG Road, Indiranagar")}
            {field("city", "City / Town", "e.g., Bengaluru")}
            {field("region", "State / Province", "e.g., Karnataka")}
            {field("postalCode", "PIN / Postal code", "e.g., 560038")}
            {field("country", "Country", "India")}
          </div>
        </section>

        {/* Step 2: Payment Method */}
        <section className="rounded-2xl border border-ink/10 bg-white p-6 shadow-2xs md:p-8 dark:bg-zinc-900">
          <div className="mb-5 border-b border-ink/10 pb-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              2. Payment Options
            </span>
            <h2 className="mt-1 font-display text-2xl font-semibold text-ink">Select Payment Method</h2>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                { id: "UPI", label: "UPI (GPay, PhonePe)", icon: Smartphone },
                { id: "CARD", label: "Credit / Debit Card", icon: CreditCard },
                { id: "COD", label: "Cash on Delivery", icon: Banknote },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <label
                key={id}
                className={`flex cursor-pointer flex-col gap-2 rounded-xl border p-4 text-xs font-semibold transition ${
                  selectedMethod === id
                    ? "border-emerald-700 bg-emerald-50/50 text-emerald-950 ring-1 ring-emerald-700"
                    : "border-ink/15 hover:border-ink/30 text-ink/80"
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon size={18} className={selectedMethod === id ? "text-emerald-700" : "text-ink/50"} />
                  <input type="radio" value={id} {...register("paymentMethod")} className="accent-emerald-700" />
                </div>
                <span>{label}</span>
              </label>
            ))}
          </div>
        </section>
      </div>

      {/* Right Sidebar: Order Summary */}
      <aside className="h-fit rounded-2xl border border-ink/10 bg-sand/30 p-6 space-y-5">
        <h2 className="font-display text-xl font-semibold text-ink">Order Summary</h2>

        <div className="divide-y divide-ink/10 text-xs">
          {cart.items.map((item) => (
            <div key={item.productId} className="flex justify-between gap-4 py-2.5">
              <span className="text-ink/80">
                <strong className="font-semibold text-ink">{item.name}</strong> × {item.quantity}
              </span>
              <span className="font-semibold text-ink">
                {money(item.price * item.quantity, activeQuote?.currency)}
              </span>
            </div>
          ))}
        </div>

        {/* Promo Code Box */}
        <div className="pt-2">
          <label htmlFor="checkout-coupon" className="block text-[11px] font-semibold uppercase tracking-wider text-ink/60 mb-1.5">
            Promo / Coupon Code
          </label>
          <div className="flex gap-2">
            <input
              id="checkout-coupon"
              aria-label="Coupon code"
              value={couponCode}
              onChange={(event) => {
                setCouponCode(event.target.value.toUpperCase());
                setAppliedCoupon(null);
              }}
              placeholder="e.g., WELCOME10"
              className="w-full rounded-xl border border-ink/15 bg-white px-3 py-2 text-xs font-mono uppercase text-ink outline-none focus:border-emerald-700 dark:bg-zinc-900"
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-xl px-4 text-xs font-semibold shrink-0"
              disabled={promotion.isPending || !couponCode.trim()}
              onClick={() => promotion.mutate()}
            >
              {promotion.isPending ? "Applying..." : "Apply"}
            </Button>
          </div>
        </div>

        {orderQuote.isError && (
          <p role="alert" className="text-xs text-red-700">
            Could not calculate shipping and taxes. Please refresh.
          </p>
        )}

        <div className="space-y-2 border-t border-ink/10 pt-4 text-xs text-ink/70">
          <div className="flex justify-between">
            <span>Items Subtotal</span>
            <span className="font-medium text-ink">
              {money(activeQuote?.subtotal ?? cart.total, activeQuote?.currency)}
            </span>
          </div>
          {activeQuote?.discountAmount ? (
            <div className="flex justify-between text-emerald-700 font-medium">
              <span>Discount ({appliedCoupon?.code || "Promo"})</span>
              <span>−{money(activeQuote.discountAmount, activeQuote.currency)}</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span>Estimated Tax (GST)</span>
            <span className="font-medium text-ink">
              {money(activeQuote?.taxAmount || 0, activeQuote?.currency)}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Delivery Charges</span>
            <span className="font-medium text-ink">
              {activeQuote?.shippingAmount
                ? money(activeQuote.shippingAmount, activeQuote.currency)
                : "FREE"}
            </span>
          </div>
        </div>

        <div className="flex justify-between border-t border-ink/10 pt-4 text-base font-bold text-ink">
          <span>Order Total</span>
          <span className="text-emerald-800">
            {money(activeQuote?.totalAmount ?? cart.total, activeQuote?.currency)}
          </span>
        </div>

        <Button
          type="submit"
          disabled={order.isPending || (!orderQuote.data && !appliedCoupon)}
          className="w-full h-12 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white text-sm font-semibold shadow-xs"
        >
          {order.isPending ? "Processing Order..." : "Place Order & Pay"}
        </Button>

        <p className="flex items-center justify-center gap-1.5 text-[11px] text-ink/50 text-center">
          <ShieldCheck size={14} className="text-emerald-700 shrink-0" />
          256-bit SSL encrypted checkout
        </p>
      </aside>
    </form>
  );
}

export default function CheckoutPage() {
  return (
    <AuthGate>
      <section className="mx-auto max-w-6xl px-5 py-10 md:px-10 md:py-14">
        <div className="mb-8 border-b border-ink/10 pb-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Secure Checkout
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Complete Your Order
          </h1>
        </div>
        <CheckoutForm />
      </section>
    </AuthGate>
  );
}
