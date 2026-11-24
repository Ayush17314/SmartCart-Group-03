"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Heart, Moon, Search, ShoppingBag, Sun, User as UserIcon, X } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { useUI } from "@/store/ui";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Cart, User } from "@/lib/types";

export function Header() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [dark, setDark] = useState(false);
  const { setCartOpen, setSearchOpen } = useUI();

  const branding = useQuery({
    queryKey: ["public-store-settings"],
    queryFn: api.publicStoreSettings,
    staleTime: 30_000,
  });

  const session = useQuery<{ authenticated: boolean; user?: User | null }>({
    queryKey: ["session"],
    queryFn: async () => {
      const res = await fetch("/api/auth/session");
      return res.json();
    },
    staleTime: 60_000,
  });

  const cart = useQuery<Cart>({
    queryKey: ["cart"],
    queryFn: api.cart,
    staleTime: 10_000,
    retry: false,
  });

  const totalCartItems = cart.data?.items?.reduce((sum, item) => sum + item.quantity, 0) || 0;

  useEffect(() => {
    const active = localStorage.getItem("smartcart-theme") === "dark";
    setDark(active);
    document.documentElement.classList.toggle("dark", active);
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("smartcart-theme", next ? "dark" : "light");
  };

  const user = session.data?.user;
  const isStaffOrAdmin = user && ["admin", "super_admin", "support", "inventory_staff"].includes(user.role);

  return (
    <header className="sticky top-0 z-40 border-b border-ink/10 bg-paper/95 backdrop-blur-md transition-colors">
      {/* Top micro-bar for quick announcements */}
      <div className="bg-emerald-800 px-4 py-1.5 text-center text-[11px] font-medium text-emerald-50">
        Free express delivery on orders over ₹499 • 100% genuine products with 7-day hassle-free returns
      </div>

      <div className="mx-auto flex h-[68px] max-w-[1440px] items-center justify-between px-4 sm:px-6 md:px-10">
        {/* Navigation links */}
        <nav className="hidden items-center gap-6 text-sm font-medium text-ink/70 lg:flex">
          <Link href="/products" className="transition hover:text-emerald-700">
            All Products
          </Link>
          <Link href="/products?category=Electronics" className="transition hover:text-emerald-700">
            Electronics
          </Link>
          <Link href="/products?category=Fashion" className="transition hover:text-emerald-700">
            Fashion
          </Link>
          <Link href="/products?category=Home" className="transition hover:text-emerald-700">
            Home & Living
          </Link>
          <Link href="/products?category=Beauty" className="transition hover:text-emerald-700">
            Beauty
          </Link>
        </nav>

        {/* Brand logo in center or left */}
        <BrandLogo
          className="lg:absolute lg:left-1/2 lg:-translate-x-1/2"
          brandName={branding.data?.storeName || "SmartCart"}
          logoUrl={branding.data?.logoUrl || undefined}
        />

        {/* Right utility items */}
        <div className="flex items-center gap-1 sm:gap-2">
          {/* Search Trigger */}
          <button
            aria-label="Search products"
            onClick={() => setSearchOpen(true)}
            className="rounded-full p-2.5 text-ink/80 transition hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
          >
            <Search size={19} />
          </button>

          {/* Dark / Light Toggle */}
          <button
            aria-label="Toggle dark mode"
            onClick={toggleTheme}
            className="rounded-full p-2.5 text-ink/80 transition hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>

          {/* Wishlist Link */}
          <Link
            href="/wishlist"
            aria-label="Wishlist"
            className="hidden rounded-full p-2.5 text-ink/80 transition hover:bg-black/5 hover:text-ink sm:block dark:hover:bg-white/10"
          >
            <Heart size={19} />
          </Link>

          {/* Staff/Admin link badge if privileged */}
          {isStaffOrAdmin && (
            <Link
              href={user?.role === "super_admin" ? "/super-admin/dashboard" : "/admin/orders"}
              className="hidden rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-200 md:inline-block"
            >
              {user?.role === "super_admin" ? "Super Admin" : "Staff Portal"}
            </Link>
          )}

          {/* Account / Sign In */}
          {session.data?.authenticated ? (
            <Link
              href="/account"
              className="flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold text-ink/80 transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              <UserIcon size={17} />
              <span className="hidden sm:inline-block max-w-[100px] truncate">
                {user?.name || "Account"}
              </span>
            </Link>
          ) : (
            <Link
              href="/login"
              className="rounded-full bg-sand px-3.5 py-1.5 text-xs font-semibold text-ink transition hover:bg-sand/80"
            >
              Sign In
            </Link>
          )}

          {/* Shopping Bag Button with Badge */}
          <button
            onClick={() => setCartOpen(true)}
            aria-label={`Open shopping cart, ${totalCartItems} items`}
            className="relative rounded-full p-2.5 text-ink/80 transition hover:bg-black/5 hover:text-ink dark:hover:bg-white/10"
          >
            <ShoppingBag size={20} />
            {totalCartItems > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-emerald-700 px-1 text-[10px] font-bold text-white shadow-xs">
                {totalCartItems > 99 ? "99+" : totalCartItems}
              </span>
            )}
          </button>
        </div>
      </div>

      <SearchOverlay
        value={search}
        setValue={setSearch}
        onSubmit={(query) => {
          setSearchOpen(false);
          router.push(`/products?search=${encodeURIComponent(query)}`);
        }}
      />
    </header>
  );
}

function SearchOverlay({
  value,
  setValue,
  onSubmit,
}: {
  value: string;
  setValue: (v: string) => void;
  onSubmit: (q: string) => void;
}) {
  const { searchOpen, setSearchOpen } = useUI();
  if (!searchOpen) return null;

  const popularSearches = ["Wireless Earbuds", "Sneakers", "Smart Watch", "Ceramic Mug", "Moisturizer"];

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      onSubmit(value.trim());
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/40 p-4 pt-[10vh] backdrop-blur-sm animate-in fade-in"
      onClick={() => setSearchOpen(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search catalog"
        className="mx-auto max-w-2xl rounded-2xl bg-paper p-6 shadow-2xl transition"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSearch} className="flex items-center gap-3 border-b border-ink/10 pb-4">
          <Search className="text-ink/50" size={20} />
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Search for products, brands, or categories..."
            className="w-full bg-transparent text-lg font-medium text-ink outline-none placeholder:text-ink/40"
          />
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            aria-label="Close search"
            className="rounded-full p-1 text-ink/60 hover:bg-black/5 hover:text-ink"
          >
            <X size={20} />
          </button>
        </form>

        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/45">
            Popular Searches
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {popularSearches.map((term) => (
              <button
                key={term}
                type="button"
                onClick={() => {
                  setValue(term);
                  onSubmit(term);
                }}
                className="rounded-full border border-ink/10 bg-sand/40 px-3.5 py-1.5 text-xs font-medium text-ink/80 transition hover:border-emerald-600 hover:bg-emerald-50 hover:text-emerald-800"
              >
                {term}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-3 border-t border-ink/5 pt-4">
          <button
            type="button"
            onClick={() => setSearchOpen(false)}
            className="rounded-xl px-4 py-2 text-xs font-medium text-ink/70 hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => {
              if (value.trim()) onSubmit(value.trim());
            }}
            className="rounded-xl bg-emerald-700 px-5 py-2 text-xs font-semibold text-white shadow-xs transition hover:bg-emerald-800"
          >
            Search Catalog
          </button>
        </div>
      </div>
    </div>
  );
}
