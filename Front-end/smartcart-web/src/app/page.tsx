"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, ShieldCheck, Truck, RotateCcw, Headphones, Sparkles, Tag } from "lucide-react";
import { api } from "@/lib/api";
import { ProductCard } from "@/components/product-card";
import { ProductSkeletons } from "@/components/skeletons";
import { Button } from "@/components/ui/button";

const CATEGORIES = [
  {
    name: "Electronics",
    description: "Audio, wearables, & smart gadgets",
    image: "https://images.unsplash.com/photo-1505740420928-5e560c06d30e?auto=format&fit=crop&w=800&q=80",
    href: "/products?category=Electronics",
  },
  {
    name: "Fashion",
    description: "Modern apparel & everyday footwear",
    image: "https://images.unsplash.com/photo-1523381210434-271e8be1f52b?auto=format&fit=crop&w=800&q=80",
    href: "/products?category=Fashion",
  },
  {
    name: "Home & Living",
    description: "Kitchenware, lighting, & decor",
    image: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80",
    href: "/products?category=Home",
  },
  {
    name: "Beauty & Wellness",
    description: "Premium skincare & daily essentials",
    image: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?auto=format&fit=crop&w=800&q=80",
    href: "/products?category=Beauty",
  },
];

export default function Home() {
  const { data, isLoading } = useQuery({
    queryKey: ["featured-products"],
    queryFn: () => api.products("limit=8&sort=rating&order=desc"),
  });

  return (
    <div className="space-y-16 pb-16">
      {/* 1. Hero Showcase Section */}
      <section className="relative overflow-hidden bg-gradient-to-b from-sand/50 via-sand/20 to-paper py-12 md:py-20">
        <div className="mx-auto grid max-w-[1440px] items-center gap-10 px-5 md:grid-cols-2 md:px-10">
          <div className="space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-700/20 bg-emerald-50 px-3.5 py-1 text-xs font-semibold uppercase tracking-wider text-emerald-800">
              <Sparkles size={14} /> New Season Arrivals
            </div>
            <h1 className="font-display text-4xl font-semibold tracking-tight text-ink sm:text-5xl lg:text-6xl">
              Quality products, <br />
              <span className="text-emerald-800">delivered fast</span> to your doorstep.
            </h1>
            <p className="max-w-lg text-base leading-relaxed text-ink/70">
              Explore authentic tech, stylish apparel, and functional home essentials backed by our 7-day hassle-free replacement guarantee.
            </p>
            <div className="flex flex-wrap gap-4 pt-2">
              <Button asChild size="lg" className="rounded-full bg-emerald-800 px-7 text-sm font-semibold hover:bg-emerald-900 shadow-sm">
                <Link href="/products">
                  Shop Now <ArrowRight size={16} className="ml-2" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="rounded-full px-7 text-sm font-semibold">
                <Link href="/products?category=Electronics">
                  Explore Electronics
                </Link>
              </Button>
            </div>
          </div>

          <div className="relative">
            <div className="overflow-hidden rounded-3xl border border-ink/10 shadow-xl">
              <img
                src="https://images.unsplash.com/photo-1498049794561-7780e7231661?auto=format&fit=crop&w=1200&q=85"
                alt="Curated modern lifestyle devices and home technology"
                className="aspect-[4/3] w-full object-cover"
              />
            </div>
            {/* Promotional overlay badge */}
            <div className="absolute -bottom-5 -left-4 rounded-2xl border border-ink/10 bg-paper/95 p-4 shadow-lg backdrop-blur-md sm:left-6">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
                  <Tag size={20} />
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-ink/50">Special Promo</p>
                  <p className="text-sm font-bold text-ink">Use WELCOME10 for 10% Off</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Trust Signals Bar */}
      <section className="mx-auto max-w-[1440px] px-5 md:px-10">
        <div className="grid grid-cols-2 gap-4 rounded-2xl border border-ink/10 bg-sand/30 p-6 sm:grid-cols-4 sm:p-8">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
              <Truck size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-ink">Free Express Delivery</h4>
              <p className="text-xs text-ink/60">On orders above ₹499</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-ink">100% Genuine</h4>
              <p className="text-xs text-ink/60">Direct from verified brands</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
              <RotateCcw size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-ink">Easy 7-Day Returns</h4>
              <p className="text-xs text-ink/60">No-questions-asked refund</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-800">
              <Headphones size={20} />
            </div>
            <div>
              <h4 className="text-sm font-bold text-ink">24/7 Priority Support</h4>
              <p className="text-xs text-ink/60">Always here to help you</p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Browse by Category */}
      <section className="mx-auto max-w-[1440px] px-5 md:px-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Categories</p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
              Shop by Department
            </h2>
          </div>
          <Link
            href="/products"
            className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            All Categories <ArrowRight size={14} />
          </Link>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CATEGORIES.map((cat) => (
            <Link
              key={cat.name}
              href={cat.href}
              className="group relative overflow-hidden rounded-2xl border border-ink/10 bg-sand/20 transition duration-300 hover:border-ink/20 hover:shadow-md"
            >
              <div className="relative aspect-[4/3] overflow-hidden bg-sand/50">
                <img
                  src={cat.image}
                  alt={cat.name}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  loading="lazy"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
                <div className="absolute bottom-4 left-4 text-white">
                  <h3 className="font-display text-lg font-semibold">{cat.name}</h3>
                  <p className="text-xs text-white/80">{cat.description}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 4. Featured / Best Seller Products Grid */}
      <section className="mx-auto max-w-[1440px] px-5 md:px-10">
        <div className="mb-8 flex items-end justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Top Picks</p>
            <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink md:text-3xl">
              Featured & Trending Products
            </h2>
          </div>
          <Link
            href="/products"
            className="flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-800"
          >
            View Full Catalog <ArrowRight size={14} />
          </Link>
        </div>

        {isLoading ? (
          <ProductSkeletons />
        ) : data?.items?.length ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:gap-6 lg:grid-cols-4">
            {data.items.map((product) => (
              <ProductCard key={product._id} product={product} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-ink/10 bg-sand/20 p-10 text-center">
            <p className="text-sm font-semibold text-ink">Products are being stocked.</p>
            <Link href="/products" className="mt-2 inline-block text-xs text-emerald-700 underline">
              Browse all items
            </Link>
          </div>
        )}
      </section>

      {/* 5. Promotional Callout Banner */}
      <section className="mx-5 md:mx-10">
        <div className="mx-auto max-w-[1440px] rounded-3xl bg-gradient-to-r from-emerald-900 to-emerald-800 px-6 py-12 text-center text-white md:px-12 md:py-16">
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-300">
            SmartCart Member Exclusive
          </p>
          <h2 className="mx-auto mt-3 max-w-xl font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Ready to upgrade your everyday setup?
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-sm text-emerald-100/90 leading-relaxed">
            Create an account today to earn loyalty rewards, track orders seamlessly, and receive early access to seasonal flash sales.
          </p>
          <div className="mt-8 flex justify-center gap-4">
            <Button asChild size="lg" className="rounded-full bg-white px-8 text-sm font-semibold text-emerald-950 hover:bg-emerald-50">
              <Link href="/register">Create Free Account</Link>
            </Button>
            <Button asChild variant="outline" size="lg" className="rounded-full border-emerald-400/40 text-white hover:bg-white/10">
              <Link href="/products">Explore Store</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
