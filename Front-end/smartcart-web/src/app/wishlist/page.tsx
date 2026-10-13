"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Heart, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import type { Product } from "@/lib/types";
import { ProductCard } from "@/components/product-card";
import { ProductSkeletons } from "@/components/skeletons";
import { AuthGate } from "@/components/auth-gate";
import { Button } from "@/components/ui/button";

function SavedItems() {
  const qc = useQueryClient();
  const { data: ids, isLoading } = useQuery({
    queryKey: ["wishlist"],
    queryFn: api.wishlist,
  });

  const { data: products, isLoading: loadingProducts } = useQuery({
    queryKey: ["wishlist-products", ids?.products],
    queryFn: async () => Promise.all((ids?.products || []).map((id) => api.product(id))),
    enabled: !!ids && (ids.products?.length || 0) > 0,
  });

  const remove = useMutation({
    mutationFn: api.removeWishlist,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["wishlist"] });
      const previous = qc.getQueryData<{ products: string[] }>(["wishlist"]);
      qc.setQueryData(["wishlist"], {
        products: (previous?.products || []).filter((value) => value !== id),
      });
      qc.setQueryData<Product[]>(["wishlist-products", ids?.products], (old) =>
        old?.filter((product) => product._id !== id)
      );
      return { previous };
    },
    onError: (_error, _id, context) => {
      qc.setQueryData(["wishlist"], context?.previous);
      toast.error("Could not remove item from wishlist");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["wishlist"] });
      qc.invalidateQueries({ queryKey: ["wishlist-products"] });
    },
  });

  const count = ids?.products?.length || 0;

  return (
    <section className="mx-auto max-w-[1440px] px-5 py-10 md:px-10 md:py-14">
      <div className="mb-8 border-b border-ink/10 pb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Saved Items</p>
        <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight text-ink md:text-4xl">
          My Wishlist
        </h1>
        <p className="mt-1 text-xs text-ink/60">
          {count} {count === 1 ? "item" : "items"} saved for later
        </p>
      </div>

      {isLoading || loadingProducts ? (
        <ProductSkeletons />
      ) : products?.length ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-6 lg:grid-cols-4">
          {products.map((product) => (
            <div key={product._id} className="flex flex-col justify-between">
              <ProductCard product={product} />
              <button
                onClick={() => remove.mutate(product._id)}
                className="mt-2 flex items-center justify-center gap-1.5 py-1 text-xs font-medium text-ink/50 hover:text-red-600 transition"
              >
                <Trash2 size={13} /> Remove from wishlist
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-3xl border border-ink/10 bg-sand/30 p-12 text-center max-w-lg mx-auto">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-sand text-ink/40">
            <Heart size={30} />
          </div>
          <h2 className="mt-4 font-display text-2xl font-semibold text-ink">Your wishlist is empty</h2>
          <p className="mt-1 text-sm text-ink/60">
            Save items you like to purchase them later or monitor discounts.
          </p>
          <Button asChild className="mt-6 rounded-full px-8">
            <Link href="/products">
              Explore Products <ArrowRight size={14} className="ml-2" />
            </Link>
          </Button>
        </div>
      )}
    </section>
  );
}

export default function WishlistPage() {
  return (
    <AuthGate>
      <SavedItems />
    </AuthGate>
  );
}
