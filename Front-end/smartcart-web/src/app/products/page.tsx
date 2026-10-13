"use client";

import { useQuery } from "@tanstack/react-query";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useMemo } from "react";
import { api } from "@/lib/api";
import { ProductGrid } from "@/components/product-grid";
import { ProductSkeletons } from "@/components/skeletons";
import { Button } from "@/components/ui/button";

const CATEGORIES = ["All", "Electronics", "Fashion", "Home", "Beauty"];

function ProductsContent() {
  const params = useSearchParams();
  const router = useRouter();

  const query = useMemo(() => {
    const q = new URLSearchParams();
    for (const key of ["search", "category", "brand", "sort", "order"]) {
      const value = params.get(key);
      if (value) q.set(key, value);
    }
    q.set("page", "1");
    q.set("limit", "40");
    return q.toString();
  }, [params]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["products", query],
    queryFn: () => api.products(query),
  });

  const category = params.get("category");
  const search = params.get("search");
  const currentSort = params.get("sort") || "createdAt";
  const currentOrder = params.get("order") || "desc";

  const handleSortChange = (value: string) => {
    const q = new URLSearchParams(params.toString());
    switch (value) {
      case "price-asc":
        q.set("sort", "price");
        q.set("order", "asc");
        break;
      case "price-desc":
        q.set("sort", "price");
        q.set("order", "desc");
        break;
      case "rating-desc":
        q.set("sort", "rating");
        q.set("order", "desc");
        break;
      case "name-asc":
        q.set("sort", "name");
        q.set("order", "asc");
        break;
      default:
        q.set("sort", "createdAt");
        q.set("order", "desc");
        break;
    }
    router.push(`/products?${q.toString()}`);
  };

  const getSortSelectValue = () => {
    if (currentSort === "price" && currentOrder === "asc") return "price-asc";
    if (currentSort === "price" && currentOrder === "desc") return "price-desc";
    if (currentSort === "rating") return "rating-desc";
    if (currentSort === "name") return "name-asc";
    return "createdAt";
  };

  return (
    <section className="mx-auto max-w-[1440px] px-5 py-10 md:px-10 md:py-14">
      {/* Page Title & Context */}
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
          {search ? `Search results for "${search}"` : category ? `${category} Catalog` : "Explore Catalog"}
        </p>
        <h1 className="mt-2 text-3xl font-display font-semibold tracking-tight text-ink md:text-4xl">
          {search ? `Results for "${search}"` : category ? category : "All Products"}
        </h1>
        <p className="mt-2 text-sm text-ink/65">
          Discover verified products with fast delivery, authentic warranties, and hassle-free returns.
        </p>
      </div>

      {/* Filter Chips & Sort Dropdown */}
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4 border-b border-ink/10 pb-6">
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((chip) => {
            const isSelected = chip === "All" ? !category : category === chip;
            return (
              <Button
                key={chip}
                size="sm"
                variant={isSelected ? "default" : "outline"}
                className={`rounded-full text-xs font-medium ${
                  isSelected ? "bg-emerald-700 hover:bg-emerald-800 text-white" : ""
                }`}
                onClick={() => {
                  const q = new URLSearchParams(params.toString());
                  if (chip === "All") {
                    q.delete("category");
                  } else {
                    q.set("category", chip);
                  }
                  router.push(`/products${q.toString() ? `?${q.toString()}` : ""}`);
                }}
              >
                {chip}
              </Button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <label htmlFor="sort-select" className="text-xs font-medium text-ink/60">
            Sort by:
          </label>
          <select
            id="sort-select"
            aria-label="Sort products"
            className="rounded-xl border border-ink/15 bg-white px-3 py-1.5 text-xs font-medium text-ink outline-none transition focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 dark:bg-zinc-900"
            value={getSortSelectValue()}
            onChange={(e) => handleSortChange(e.target.value)}
          >
            <option value="createdAt">Newest arrivals</option>
            <option value="price-asc">Price: Low to high</option>
            <option value="price-desc">Price: High to low</option>
            <option value="rating-desc">Customer rating: High to low</option>
            <option value="name-asc">Alphabetical (A - Z)</option>
          </select>
        </div>
      </div>

      {/* Product Content or Loading/Empty States */}
      {isLoading ? (
        <ProductSkeletons />
      ) : error ? (
        <div role="alert" className="rounded-2xl border border-red-100 bg-red-50/50 p-10 text-center">
          <p className="text-base font-semibold text-red-800">Unable to load products.</p>
          <p className="mt-1 text-sm text-red-600">Please check your network connection and try again.</p>
          <Button className="mt-4" variant="outline" onClick={() => router.refresh()}>
            Retry
          </Button>
        </div>
      ) : (data?.items?.length || 0) === 0 ? (
        <div className="rounded-2xl border border-ink/10 bg-sand/30 p-12 text-center">
          <p className="text-lg font-semibold text-ink">No products found</p>
          <p className="mt-1 text-sm text-ink/60">Try adjusting your filters or search terms.</p>
          <Button
            className="mt-5"
            onClick={() => router.push("/products")}
          >
            View all products
          </Button>
        </div>
      ) : (
        <>
          <ProductGrid products={data?.items || []} />
          <div className="mt-10 border-t border-ink/10 pt-6 text-center text-xs font-medium text-ink/50">
            Showing {data?.items.length || 0} of {data?.pagination.total || 0} verified products
          </div>
        </>
      )}
    </section>
  );
}

export default function ProductsPage() {
  return (
    <Suspense
      fallback={
        <section className="mx-auto max-w-[1440px] px-5 py-12 md:px-10">
          <ProductSkeletons />
        </section>
      }
    >
      <ProductsContent />
    </Suspense>
  );
}
