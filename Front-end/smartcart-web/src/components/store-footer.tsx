"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BrandLogo } from "@/components/brand-logo";

export function StoreFooter() {
  const { data } = useQuery({
    queryKey: ["public-store-settings"],
    queryFn: api.publicStoreSettings,
    staleTime: 30_000,
  });

  return (
    <footer className="mt-20 border-t border-ink/10 bg-sand/30 px-5 py-12 md:px-10">
      <div className="mx-auto max-w-[1440px]">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Column 1: Brand & Bio */}
          <div className="space-y-3">
            <BrandLogo brandName={data?.storeName || "SmartCart"} logoUrl={data?.logoUrl || undefined} />
            <p className="text-xs leading-relaxed text-ink/60 max-w-xs">
              Your trusted destination for authentic electronics, modern fashion, home essentials, and everyday beauty products with fast nationwide delivery.
            </p>
          </div>

          {/* Column 2: Shop Categories */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Shop by Category</h3>
            <ul className="mt-3 space-y-2 text-xs text-ink/65">
              <li>
                <Link href="/products?category=Electronics" className="hover:text-emerald-700 transition">
                  Electronics & Gadgets
                </Link>
              </li>
              <li>
                <Link href="/products?category=Fashion" className="hover:text-emerald-700 transition">
                  Fashion & Footwear
                </Link>
              </li>
              <li>
                <Link href="/products?category=Home" className="hover:text-emerald-700 transition">
                  Home & Kitchen
                </Link>
              </li>
              <li>
                <Link href="/products?category=Beauty" className="hover:text-emerald-700 transition">
                  Beauty & Personal Care
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 3: Customer Account */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Customer Account</h3>
            <ul className="mt-3 space-y-2 text-xs text-ink/65">
              <li>
                <Link href="/account" className="hover:text-emerald-700 transition">
                  My Profile
                </Link>
              </li>
              <li>
                <Link href="/orders" className="hover:text-emerald-700 transition">
                  Track Orders
                </Link>
              </li>
              <li>
                <Link href="/wishlist" className="hover:text-emerald-700 transition">
                  Saved Wishlist
                </Link>
              </li>
              <li>
                <Link href="/cart" className="hover:text-emerald-700 transition">
                  Shopping Cart
                </Link>
              </li>
            </ul>
          </div>

          {/* Column 4: Policies & Help */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink">Help & Policies</h3>
            <p className="mt-3 text-xs leading-relaxed text-ink/65">
              {data?.returnPolicy ||
                "Enjoy 7-day easy returns and replacements on eligible items. Free standard shipping on orders above ₹499."}
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-ink/10 pt-6 text-xs text-ink/50">
          <span>
            © {new Date().getFullYear()} {data?.storeName || "SmartCart"}. All rights reserved.
          </span>
          <div className="flex gap-5">
            <span>100% Authentic Products</span>
            <span>•</span>
            <span>Secure Payments via UPI, Card & COD</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
