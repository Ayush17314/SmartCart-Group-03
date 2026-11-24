import type { PaymentCheckout } from "@/lib/types";

export type RazorpayResult = {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  description: string;
  prefill?: { name?: string };
  handler: (result: RazorpayResult) => void | Promise<void>;
  modal?: { ondismiss?: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (event: string, callback: (event: unknown) => void) => void;
    };
  }
}

export async function loadRazorpay(): Promise<void> {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-razorpay-checkout]");
    const script = existing || document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.dataset.razorpayCheckout = "true";
    script.onload = () => window.Razorpay ? resolve() : reject(new Error("Razorpay Checkout could not be loaded"));
    script.onerror = () => reject(new Error("Could not load Razorpay Checkout"));
    if (!existing) document.body.appendChild(script);
  });
}

export function openRazorpayCheckout(checkout: PaymentCheckout, handler: RazorpayOptions["handler"], customerName?: string, onDismiss?: () => void) {
  const Razorpay = window.Razorpay;
  if (!Razorpay) throw new Error("Razorpay Checkout could not be loaded");
  const payment = new Razorpay({
    key: checkout.keyId,
    order_id: checkout.orderId,
    amount: checkout.amount,
    currency: checkout.currency,
    name: checkout.name,
    description: checkout.description,
    prefill: customerName ? { name: customerName } : undefined,
    handler,
    modal: { ondismiss: onDismiss },
  });
  payment.open();
  return payment;
}
