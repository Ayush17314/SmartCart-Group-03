"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Heart, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import type { Cart, Product } from "@/lib/types";
import { useStoreCurrency } from "@/lib/use-store-currency";
import { api, ApiError } from "@/lib/api";
import { imageFor, money } from "@/lib/utils";

export function ProductCard({ product }: { product: Product }) {
  const currency = useStoreCurrency();
  const qc = useQueryClient();

  const { data: wishlistData } = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => api.wishlist(),
    staleTime: 30_000,
    retry: false,
  });

  const isSaved = wishlistData?.products?.includes(product._id);
  const isOutOfStock = product.stock <= 0;
  const isLowStock = product.stock > 0 && product.stock <= 5;
  const ratingScore = product.rating || 4.5;

  const add = useMutation({
    mutationFn: () => api.addCart(product._id),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["cart"] });
      const previous = qc.getQueryData<Cart>(["cart"]);
      if (previous) {
        const existing = previous.items.find((item) => item.productId === product._id);
        const items = existing
          ? previous.items.map((item) =>
              item.productId === product._id ? { ...item, quantity: item.quantity + 1 } : item
            )
          : [...previous.items, { productId: product._id, name: product.name, price: product.price, quantity: 1, image: product.images?.[0] }];
        qc.setQueryData(["cart"], { ...previous, items, total: previous.total + product.price });
      } else {
        qc.setQueryData(["cart"], {
          items: [{ productId: product._id, name: product.name, price: product.price, quantity: 1, image: product.images?.[0] }],
          total: product.price,
        });
      }
      return { previous };
    },
    onSuccess: () => toast.success(`Added ${product.name} to cart`),
    onSettled: () => qc.invalidateQueries({ queryKey: ["cart"] }),
    onError: (error, _variables, context) => {
      qc.setQueryData(["cart"], context?.previous);
      if (error instanceof ApiError && error.status === 401) {
        toast.error("Please sign in to add items to your cart");
      } else {
        toast.error(error instanceof Error ? error.message : "Could not add item to cart");
      }
    },
  });

  const heart = useMutation({
    mutationFn: () => isSaved ? api.removeWishlist(product._id) : api.addWishlist(product._id),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["wishlist"] });
      const previous = qc.getQueryData<{ products: string[] }>(["wishlist"]);
      const nextProducts = isSaved
        ? (previous?.products || []).filter((id) => id !== product._id)
        : [...new Set([...(previous?.products || []), product._id])];
      qc.setQueryData(["wishlist"], { products: nextProducts });
      return { previous };
    },
    onSuccess: () => toast.success(isSaved ? "Removed from wishlist" : "Saved to wishlist"),
    onError: (error, _variables, context) => {
      qc.setQueryData(["wishlist"], context?.previous);
      if (error instanceof ApiError && error.status === 401) {
        toast.error("Please sign in to save items to your wishlist");
      } else {
        toast.error(error instanceof Error ? error.message : "Could not update wishlist");
      }
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["wishlist"] }),
  });

  return (
    <article className="group flex flex-col justify-between rounded-2xl border border-ink/5 bg-sand/20 p-3 transition duration-300 hover:border-ink/15 hover:shadow-lg">
      <div className="relative overflow-hidden rounded-xl bg-sand/50">
        <Link href={`/products/${product._id}`} aria-label={`View ${product.name}`}>
          <img
            src={imageFor(product)}
            alt={product.name}
            className="aspect-[4/3] w-full object-cover transition duration-500 group-hover:scale-105"
            loading="lazy"
          />
        </Link>

        {/* Stock / Promotion Badges */}
        <div className="absolute top-2.5 left-2.5 flex flex-col gap-1">
          {isOutOfStock ? (
            <span className="rounded-full bg-red-600/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
              Out of stock
            </span>
          ) : isLowStock ? (
            <span className="rounded-full bg-amber-500/90 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white shadow-xs">
              Only {product.stock} left
            </span>
          ) : null}
        </div>

        {/* Wishlist Button */}
        <button
          onClick={() => heart.mutate()}
          className={`absolute top-2.5 right-2.5 grid h-9 w-9 place-items-center rounded-full shadow-sm transition ${
            isSaved
              ? "bg-red-50 text-red-600 ring-1 ring-red-200"
              : "bg-white/90 text-ink/70 hover:bg-white hover:text-ink"
          }`}
          aria-label={isSaved ? "Remove from wishlist" : "Add to wishlist"}
        >
          <Heart size={16} className={isSaved ? "fill-red-600 text-red-600" : ""} />
        </button>

        {/* Quick Add overlay button */}
        {!isOutOfStock && (
          <div className="absolute inset-x-2.5 bottom-2.5 translate-y-2 opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 focus-within:translate-y-0 focus-within:opacity-100">
            <button
              onClick={() => add.mutate()}
              disabled={add.isPending}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-ink/90 py-2.5 text-xs font-semibold text-white shadow-md backdrop-blur-xs transition hover:bg-ink disabled:opacity-50"
            >
              <Plus size={15} /> Quick add to cart
            </button>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 pt-3">
        <div className="flex items-center justify-between text-xs text-ink/50">
          <span className="font-medium uppercase tracking-wider">{product.category}</span>
          {product.brand && <span>{product.brand}</span>}
        </div>

        <Link
          href={`/products/${product._id}`}
          className="line-clamp-2 text-sm font-semibold text-ink transition hover:text-emerald-700"
        >
          {product.name}
        </Link>

        {/* Rating Score */}
        <div className="flex items-center gap-1.5 text-xs">
          <div className="flex items-center text-amber-500">
            <Star size={13} className="fill-amber-400 text-amber-400" />
          </div>
          <span className="font-semibold text-ink">{ratingScore.toFixed(1)}</span>
          <span className="text-ink/40">· Verified</span>
        </div>

        <div className="mt-1 flex items-baseline justify-between border-t border-ink/5 pt-2">
          <span className="text-base font-bold text-ink">
            {money(product.price, currency)}
          </span>
          {isOutOfStock ? (
            <span className="text-xs font-medium text-red-600">Unavailable</span>
          ) : (
            <span className="text-[11px] font-medium text-emerald-700">Free Delivery</span>
          )}
        </div>
      </div>
    </article>
  );
}
