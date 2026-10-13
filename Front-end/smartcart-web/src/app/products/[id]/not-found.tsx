import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl place-content-center px-6 text-center">
      <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">404 — Not Found</p>
      <h1 className="mt-2 font-display text-3xl font-semibold text-ink md:text-4xl">
        Product Not Found
      </h1>
      <p className="mt-2 text-sm text-ink/60">
        The product you are looking for may have been removed or is no longer available.
      </p>
      <div className="mt-6">
        <Button asChild className="rounded-full px-7">
          <Link href="/products">Browse All Products</Link>
        </Button>
      </div>
    </div>
  );
}
