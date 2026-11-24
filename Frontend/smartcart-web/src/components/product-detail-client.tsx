"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Minus, Plus, ShieldCheck, Truck, RotateCcw, Star, CheckCircle2, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import type { Product } from "@/lib/types";
import { imageFor, money } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useStoreCurrency } from "@/lib/use-store-currency";
import { api, ApiError } from "@/lib/api";
import { ReviewPanel } from "@/components/review-panel";

export function ProductDetailClient({ product }: { product: Product }) {
  const currency = useStoreCurrency();
  const [qty, setQty] = useState(1);
  const [tab, setTab] = useState<"Details" | "Specifications" | "Reviews">("Details");
  const [activeImage, setActiveImage] = useState(0);
  const qc = useQueryClient();

  const { data: wishlistData } = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => api.wishlist(),
    staleTime: 30_000,
    retry: false,
  });

  const isSaved = wishlistData?.products?.includes(product._id);

  const add = useMutation({
    mutationFn: () => api.addCart(product._id, qty),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cart"] });
      toast.success(`${qty} × ${product.name} added to cart`);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        toast.error("Please sign in to add items to your cart");
      } else {
        toast.error(error instanceof Error ? error.message : "Could not add item to cart");
      }
    },
  });

  const toggleWishlist = useMutation({
    mutationFn: () => isSaved ? api.removeWishlist(product._id) : api.addWishlist(product._id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["wishlist"] });
      toast.success(isSaved ? "Removed from wishlist" : "Saved to your wishlist");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 401) {
        toast.error("Please sign in to save items to your wishlist");
      } else {
        toast.error(error instanceof Error ? error.message : "Could not update wishlist");
      }
    },
  });

  const images = product.images?.length ? product.images : [imageFor(product)];
  const isOutOfStock = product.stock <= 0;
  const isLowStock = product.stock > 0 && product.stock <= 5;
  const ratingScore = product.rating || 4.5;

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-8 md:px-10 md:py-12">
      <div className="grid gap-10 lg:grid-cols-[1.1fr_.9fr] lg:gap-14">
        {/* Left: Image Gallery */}
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl border border-ink/5 bg-sand/40">
            <img
              src={images[activeImage] || imageFor(product, activeImage)}
              alt={`${product.name} - view ${activeImage + 1}`}
              className="aspect-[4/3] w-full object-contain md:aspect-[16/11]"
            />
            {isOutOfStock && (
              <span className="absolute top-4 left-4 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                Out of Stock
              </span>
            )}
            {isLowStock && (
              <span className="absolute top-4 left-4 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white shadow-sm">
                Only {product.stock} Left!
              </span>
            )}
          </div>

          {images.length > 1 && (
            <div className="flex gap-3 overflow-x-auto pb-2">
              {images.map((src, i) => (
                <button
                  key={`${src}-${i}`}
                  onClick={() => setActiveImage(i)}
                  className={`h-20 w-20 shrink-0 overflow-hidden rounded-xl border-2 transition ${
                    activeImage === i
                      ? "border-emerald-700 ring-2 ring-emerald-700/20"
                      : "border-ink/10 opacity-70 hover:opacity-100"
                  }`}
                  aria-label={`View photo ${i + 1}`}
                >
                  <img
                    src={src || imageFor(product, i)}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}

          {/* Product tabs */}
          <div className="mt-10 border-t border-ink/10 pt-8">
            <div className="flex gap-8 border-b border-ink/10">
              {(["Details", "Specifications", "Reviews"] as const).map((name) => (
                <button
                  key={name}
                  onClick={() => setTab(name)}
                  className={`relative pb-3 text-sm font-medium transition ${
                    tab === name
                      ? "text-emerald-700"
                      : "text-ink/60 hover:text-ink"
                  }`}
                >
                  {name}
                  {tab === name && (
                    <span className="absolute bottom-0 left-0 h-0.5 w-full bg-emerald-700" />
                  )}
                </button>
              ))}
            </div>

            <div className="py-6 text-sm leading-relaxed text-ink/75">
              {tab === "Details" && (
                <div className="space-y-4">
                  <p className="whitespace-pre-line text-ink/80">
                    {product.description || "High-quality product built with durable materials, engineered for performance and longevity."}
                  </p>
                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex items-start gap-2.5 rounded-xl border border-ink/5 bg-sand/30 p-3.5">
                      <CheckCircle2 className="mt-0.5 text-emerald-600 shrink-0" size={16} />
                      <div>
                        <h4 className="font-semibold text-ink text-xs uppercase tracking-wider">Quality Verified</h4>
                        <p className="text-xs text-ink/65 mt-0.5">Undergoes multi-point inspection before dispatch.</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-2.5 rounded-xl border border-ink/5 bg-sand/30 p-3.5">
                      <ShieldCheck className="mt-0.5 text-emerald-600 shrink-0" size={16} />
                      <div>
                        <h4 className="font-semibold text-ink text-xs uppercase tracking-wider">Authentic Item</h4>
                        <p className="text-xs text-ink/65 mt-0.5">100% genuine brand manufacturer stock.</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === "Specifications" && (
                <div className="rounded-xl border border-ink/5 bg-sand/20 p-5">
                  {product.specifications && Object.keys(product.specifications).length > 0 ? (
                    <dl className="grid grid-cols-1 gap-y-3 sm:grid-cols-2 sm:gap-x-6">
                      {Object.entries(product.specifications).map(([k, v]) => (
                        <div key={k} className="border-b border-ink/5 pb-2">
                          <dt className="text-xs font-semibold uppercase tracking-wider text-ink/50">{k}</dt>
                          <dd className="mt-0.5 font-medium text-ink">{String(v)}</dd>
                        </div>
                      ))}
                    </dl>
                  ) : (
                    <p className="text-ink/60">Standard manufacturing specifications apply for this item.</p>
                  )}
                </div>
              )}

              {tab === "Reviews" && <ReviewPanel productId={product._id} />}
            </div>
          </div>
        </div>

        {/* Right: Buy Box / Details */}
        <aside className="h-fit space-y-6 lg:sticky lg:top-24">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-emerald-700">
              <span>{product.category}</span>
              {product.brand && (
                <>
                  <span>•</span>
                  <span>{product.brand}</span>
                </>
              )}
            </div>
            <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight text-ink md:text-4xl">
              {product.name}
            </h1>

            {/* Rating summary */}
            <div className="mt-3 flex items-center gap-2 text-sm">
              <div className="flex items-center text-amber-500">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Star
                    key={s}
                    size={16}
                    className={s <= Math.round(ratingScore) ? "fill-amber-400 text-amber-400" : "text-ink/20"}
                  />
                ))}
              </div>
              <span className="font-semibold text-ink">{ratingScore.toFixed(1)}</span>
              <span className="text-ink/40">·</span>
              <button
                onClick={() => setTab("Reviews")}
                className="text-xs font-medium text-emerald-700 underline hover:text-emerald-800"
              >
                Customer Reviews
              </button>
            </div>
          </div>

          {/* Pricing */}
          <div className="border-y border-ink/10 py-4">
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold tracking-tight text-ink">
                {money(product.price, currency)}
              </span>
              <span className="text-xs text-ink/50">Inclusive of all taxes</span>
            </div>
          </div>

          {/* Stock availability */}
          <div>
            {isOutOfStock ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-red-600">
                <AlertCircle size={18} />
                <span>Currently out of stock</span>
              </div>
            ) : isLowStock ? (
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-600">
                <AlertCircle size={18} />
                <span>Only {product.stock} items left in stock — order soon</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <CheckCircle2 size={18} />
                <span>In Stock ({product.stock} available)</span>
              </div>
            )}
          </div>

          {/* Quantity and Actions */}
          <div className="space-y-4 pt-2">
            <div className="flex items-center gap-3">
              <div className="flex h-11 items-center rounded-xl border border-ink/15 bg-white px-3 shadow-xs">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  disabled={qty <= 1 || isOutOfStock}
                  onClick={() => setQty((v) => Math.max(1, v - 1))}
                  className="p-1 text-ink/70 hover:text-ink disabled:opacity-30"
                >
                  <Minus size={15} />
                </button>
                <span className="w-9 text-center font-semibold text-sm">{qty}</span>
                <button
                  type="button"
                  aria-label="Increase quantity"
                  disabled={qty >= Math.min(product.stock, 10) || isOutOfStock}
                  onClick={() => setQty((v) => Math.min(Math.min(product.stock, 10), v + 1))}
                  className="p-1 text-ink/70 hover:text-ink disabled:opacity-30"
                >
                  <Plus size={15} />
                </button>
              </div>

              <Button
                className="h-11 flex-1 font-semibold text-sm shadow-sm"
                disabled={isOutOfStock || add.isPending}
                onClick={() => add.mutate()}
              >
                {add.isPending ? "Adding to Cart..." : isOutOfStock ? "Out of Stock" : "Add to Cart"}
              </Button>

              <Button
                variant="outline"
                size="icon"
                className={`h-11 w-11 rounded-xl transition ${
                  isSaved ? "border-red-300 bg-red-50 text-red-600 hover:bg-red-100" : "hover:bg-sand/50"
                }`}
                onClick={() => toggleWishlist.mutate()}
                aria-label={isSaved ? "Remove from wishlist" : "Save to wishlist"}
              >
                <Heart size={18} className={isSaved ? "fill-red-600 text-red-600" : ""} />
              </Button>
            </div>
          </div>

          {/* Trust Guarantees */}
          <div className="space-y-3 rounded-2xl border border-ink/10 bg-sand/20 p-4 text-xs text-ink/75">
            <div className="flex items-center gap-3">
              <Truck size={17} className="text-emerald-700 shrink-0" />
              <span>
                <strong>Free Standard Delivery</strong> on all orders above {currency === "INR" ? "₹499" : "$50"}
              </span>
            </div>
            <div className="flex items-center gap-3">
              <RotateCcw size={17} className="text-emerald-700 shrink-0" />
              <span>
                <strong>7-Day Easy Returns</strong> & hassle-free replacements
              </span>
            </div>
            <div className="flex items-center gap-3">
              <ShieldCheck size={17} className="text-emerald-700 shrink-0" />
              <span>
                <strong>100% Secure Checkout</strong> with Razorpay, UPI & Cash on Delivery
              </span>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
