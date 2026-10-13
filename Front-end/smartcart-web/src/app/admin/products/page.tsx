"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, History, Archive, RotateCcw, Edit2 } from "lucide-react";
import { AdminShell } from "@/components/admin-shell";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import type { Product } from "@/lib/types";
import { useStoreCurrency } from "@/lib/use-store-currency";
import { money } from "@/lib/utils";

type Draft = {
  name: string;
  sku: string;
  description: string;
  category: string;
  brand: string;
  price: string;
  stock: string;
  stockAdjustmentReason: string;
  images: string;
  specifications: string;
};

const emptyDraft: Draft = {
  name: "",
  sku: "",
  description: "",
  category: "Electronics",
  brand: "",
  price: "",
  stock: "10",
  stockAdjustmentReason: "",
  images: "",
  specifications: "{}",
};

const draftFromProduct = (product: Product): Draft => ({
  name: product.name,
  sku: product.sku || "",
  description: product.description || "",
  category: product.category,
  brand: product.brand || "",
  price: String(product.price),
  stock: String(product.stock),
  stockAdjustmentReason: "",
  images: (product.images || []).join("\n"),
  specifications: JSON.stringify(product.specifications || {}, null, 2),
});

function ProductsAdmin() {
  const currency = useStoreCurrency();
  const client = useQueryClient();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [sort, setSort] = useState("updatedAt");
  const [order, setOrder] = useState("desc");
  const [archiveFilter, setArchiveFilter] = useState("false");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Product | null>(null);
  const [historyId, setHistoryId] = useState("");
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [formOpen, setFormOpen] = useState(false);

  const query = useMemo(
    () =>
      new URLSearchParams({
        page: String(page),
        limit: "20",
        archived: archiveFilter,
        sort,
        order,
        ...(category ? { category } : {}),
        ...(brand ? { brand } : {}),
        ...(search.trim() ? { search: search.trim() } : {}),
      }).toString(),
    [page, archiveFilter, search, category, brand, sort, order]
  );

  const products = useQuery({
    queryKey: ["admin-products", query],
    queryFn: () => api.adminProducts(query),
  });
  const categories = useQuery({ queryKey: ["product-categories"], queryFn: api.categories });
  const brands = useQuery({ queryKey: ["product-brands"], queryFn: api.brands });
  const history = useQuery({
    queryKey: ["inventory-history", historyId],
    queryFn: () => api.inventoryMovements(historyId),
    enabled: Boolean(historyId),
  });

  const mutation = useMutation({
    mutationFn: async (input: { id?: string; draft: Draft }) => {
      const specifications = JSON.parse(input.draft.specifications || "{}") as Record<
        string,
        unknown
      >;
      const body = {
        name: input.draft.name.trim(),
        sku: input.draft.sku.trim(),
        description: input.draft.description.trim(),
        category: input.draft.category.trim(),
        brand: input.draft.brand.trim(),
        price: Number(input.draft.price),
        stock: Number(input.draft.stock),
        stockAdjustmentReason: input.draft.stockAdjustmentReason.trim() || "Updated by staff",
        images: input.draft.images
          .split(/\r?\n/)
          .map((value) => value.trim())
          .filter(Boolean),
        specifications,
      };
      return input.id ? api.updateProduct(input.id, body) : api.createProduct(body);
    },
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["admin-products"] });
      void client.invalidateQueries({ queryKey: ["admin-inventory-summary"] });
      toast.success(editing ? "Product saved" : "New product added");
      setFormOpen(false);
      setEditing(null);
      setDraft(emptyDraft);
    },
    onError: (error: Error) => toast.error(error.message || "Could not save product"),
  });

  const archive = useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      api.setProductArchived(id, archived),
    onSuccess: (_data, variables) => {
      void client.invalidateQueries({ queryKey: ["admin-products"] });
      void client.invalidateQueries({ queryKey: ["admin-inventory-summary"] });
      toast.success(variables.archived ? "Product archived" : "Product restored to catalog");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const beginCreate = () => {
    setEditing(null);
    setDraft(emptyDraft);
    setFormOpen(true);
  };

  const beginEdit = (product: Product) => {
    setEditing(product);
    setDraft(draftFromProduct(product));
    setFormOpen(true);
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const price = Number(draft.price);
    const stock = Number(draft.stock);
    if (
      !draft.name.trim() ||
      !draft.category.trim() ||
      !Number.isFinite(price) ||
      price < 0 ||
      !Number.isInteger(stock) ||
      stock < 0
    ) {
      toast.error("Please enter a valid product name, category, price, and stock quantity.");
      return;
    }
    try {
      const specs = JSON.parse(draft.specifications || "{}");
      if (!specs || Array.isArray(specs) || typeof specs !== "object") throw new Error();
    } catch {
      toast.error("Specifications must be formatted as key-value JSON.");
      return;
    }
    mutation.mutate({ id: editing?._id, draft });
  };

  return (
    <>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
            Inventory & Catalog
          </p>
          <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            Products & Stock
          </h1>
          <p className="mt-1 text-xs text-ink/60">
            Add new products, update pricing and inventory counts, or manage catalog visibility.
          </p>
        </div>
        <Button onClick={beginCreate} className="bg-emerald-800 hover:bg-emerald-900 text-white">
          <Plus size={16} className="mr-1" /> Add Product
        </Button>
      </div>

      {formOpen && (
        <form
          onSubmit={submit}
          className="mb-8 rounded-2xl border border-ink/10 bg-white p-6 shadow-xs dark:bg-zinc-900"
        >
          <div className="mb-5 flex items-center justify-between border-b border-ink/10 pb-3">
            <h2 className="font-display text-xl font-semibold text-ink">
              {editing ? `Edit Product: ${editing.name}` : "Add New Product"}
            </h2>
            <button
              type="button"
              className="text-xs font-medium text-ink/60 hover:text-ink"
              onClick={() => setFormOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {(
              [
                ["name", "Product Name"],
                ["sku", "SKU Code (optional)"],
                ["category", "Department / Category"],
                ["brand", "Brand Name"],
                ["price", `Price (${currency})`],
                ["stock", "Available Stock Units"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-xs font-semibold text-ink/80">
                {label}
                <input
                  required={key === "name" || key === "category" || key === "price" || key === "stock"}
                  type={key === "price" || key === "stock" ? "number" : "text"}
                  min={key === "price" || key === "stock" ? "0" : undefined}
                  step={key === "price" ? "0.01" : key === "stock" ? "1" : undefined}
                  value={draft[key]}
                  onChange={(event) => setDraft({ ...draft, [key]: event.target.value })}
                  className="field"
                />
              </label>
            ))}

            {editing && (
              <label className="block text-xs font-semibold text-ink/80 sm:col-span-2">
                Stock Adjustment Note (optional)
                <input
                  value={draft.stockAdjustmentReason}
                  onChange={(event) =>
                    setDraft({ ...draft, stockAdjustmentReason: event.target.value })
                  }
                  className="field"
                  placeholder="e.g., New shipment received at warehouse"
                />
              </label>
            )}

            <label className="block text-xs font-semibold text-ink/80 sm:col-span-2">
              Product Description
              <textarea
                rows={3}
                value={draft.description}
                onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                className="field"
                placeholder="Describe features, materials, and highlights..."
              />
            </label>

            <label className="block text-xs font-semibold text-ink/80 sm:col-span-2">
              Product Image URLs (one URL per line)
              <textarea
                rows={2}
                value={draft.images}
                onChange={(event) => setDraft({ ...draft, images: event.target.value })}
                className="field"
                placeholder="https://images.unsplash.com/..."
              />
            </label>

            <label className="block text-xs font-semibold text-ink/80 sm:col-span-2">
              Technical Specifications (JSON)
              <textarea
                rows={3}
                value={draft.specifications}
                onChange={(event) => setDraft({ ...draft, specifications: event.target.value })}
                className="field font-mono text-xs"
              />
            </label>
          </div>

          <div className="mt-5 flex gap-3">
            <Button
              type="submit"
              disabled={mutation.isPending}
              className="bg-emerald-800 hover:bg-emerald-900 text-white"
            >
              {mutation.isPending
                ? "Saving..."
                : editing
                ? "Save Changes"
                : "Create Product"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {/* Search & Filters */}
      <div className="mb-5 flex flex-wrap gap-3 rounded-2xl border border-ink/10 bg-sand/20 p-4">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 text-ink/40" size={16} />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            className="w-full rounded-xl border border-ink/15 bg-white pl-9 pr-3 py-2 text-xs text-ink outline-none dark:bg-zinc-900"
            placeholder="Search by product name, SKU, or brand..."
            aria-label="Search products"
          />
        </div>

        <select
          value={category}
          onChange={(event) => {
            setCategory(event.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-ink dark:bg-zinc-900"
          aria-label="Filter category"
        >
          <option value="">All Categories</option>
          {categories.data?.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>

        <select
          value={brand}
          onChange={(event) => {
            setBrand(event.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-ink dark:bg-zinc-900"
          aria-label="Filter brand"
        >
          <option value="">All Brands</option>
          {brands.data?.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>

        <select
          value={`${sort}:${order}`}
          onChange={(event) => {
            const [nextSort, nextOrder] = event.target.value.split(":");
            setSort(nextSort);
            setOrder(nextOrder);
            setPage(1);
          }}
          className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-ink dark:bg-zinc-900"
          aria-label="Sort products"
        >
          <option value="updatedAt:desc">Recently Updated</option>
          <option value="name:asc">Name (A - Z)</option>
          <option value="price:asc">Price: Low to High</option>
          <option value="price:desc">Price: High to Low</option>
          <option value="stock:asc">Stock: Low to High</option>
        </select>

        <select
          value={archiveFilter}
          onChange={(event) => {
            setArchiveFilter(event.target.value);
            setPage(1);
          }}
          className="rounded-xl border border-ink/15 bg-white px-3 py-2 text-xs font-medium text-ink dark:bg-zinc-900"
          aria-label="Product visibility"
        >
          <option value="false">Active Catalog</option>
          <option value="true">Archived</option>
          <option value="all">All Products</option>
        </select>
      </div>

      {/* Table */}
      {products.isLoading ? (
        <div className="skeleton h-72 rounded-2xl" />
      ) : products.error ? (
        <div role="alert" className="rounded-2xl bg-red-50 p-8 text-sm text-red-800">
          Could not load products.{" "}
          <button className="ml-2 underline" onClick={() => void products.refetch()}>
            Retry
          </button>
        </div>
      ) : !products.data?.items.length ? (
        <div className="rounded-2xl bg-sand/30 p-10 text-center text-xs text-ink/60">
          No products match the selected filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-ink/10 bg-white shadow-2xs dark:bg-zinc-900">
          <table className="w-full min-w-[820px] text-left text-xs">
            <thead className="border-b border-ink/10 bg-sand/40 text-[11px] font-semibold uppercase tracking-wider text-ink/60">
              <tr>
                <th className="px-4 py-3.5">Product</th>
                <th className="px-4 py-3.5">Category</th>
                <th className="px-4 py-3.5">Price</th>
                <th className="px-4 py-3.5">Stock</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-ink/5">
              {products.data.items.map((product) => (
                <tr key={product._id} className="hover:bg-sand/20 transition">
                  <td className="px-4 py-3.5">
                    <p className="font-semibold text-ink">{product.name}</p>
                    <p className="mt-0.5 text-[11px] text-ink/45">
                      {product.sku || product.brand || `ID: ${product._id.slice(-8)}`}
                    </p>
                  </td>
                  <td className="px-4 py-3.5 text-ink/75">{product.category}</td>
                  <td className="px-4 py-3.5 font-bold text-ink">
                    {money(product.price, currency)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`font-semibold ${
                        product.stock === 0
                          ? "text-red-600"
                          : product.stock <= 5
                          ? "text-amber-600"
                          : "text-emerald-700"
                      }`}
                    >
                      {product.stock} units
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                        product.archivedAt
                          ? "bg-zinc-100 text-zinc-600"
                          : "bg-emerald-100 text-emerald-800"
                      }`}
                    >
                      {product.archivedAt ? "Archived" : "Active"}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <button
                        className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline"
                        onClick={() => beginEdit(product)}
                      >
                        <Edit2 size={12} /> Edit
                      </button>
                      <button
                        className="inline-flex items-center gap-1 text-ink/60 hover:text-ink hover:underline"
                        onClick={() => setHistoryId(product._id)}
                      >
                        <History size={12} /> Stock Log
                      </button>
                      <button
                        className="inline-flex items-center gap-1 text-ink/60 hover:text-ink hover:underline"
                        disabled={archive.isPending}
                        onClick={() =>
                          archive.mutate({
                            id: product._id,
                            archived: !product.archivedAt,
                          })
                        }
                      >
                        {product.archivedAt ? (
                          <>
                            <RotateCcw size={12} /> Restore
                          </>
                        ) : (
                          <>
                            <Archive size={12} /> Archive
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {historyId && (
        <section className="mt-6 rounded-2xl border border-ink/10 bg-white p-5 shadow-xs dark:bg-zinc-900">
          <div className="mb-4 flex items-center justify-between border-b border-ink/10 pb-3">
            <h2 className="font-display text-lg font-semibold text-ink">
              Inventory Adjustment Log
            </h2>
            <button
              className="text-xs font-semibold text-ink/60 hover:text-ink"
              onClick={() => setHistoryId("")}
            >
              Close
            </button>
          </div>
          {history.isLoading ? (
            <div className="skeleton h-20 rounded-xl" />
          ) : history.error ? (
            <p role="alert" className="text-xs text-red-700">
              Could not load stock history.
            </p>
          ) : history.data?.length ? (
            <ul className="divide-y divide-ink/5 text-xs">
              {history.data.map((entry, index) => (
                <li
                  key={`${entry.changedAt}-${index}`}
                  className="flex flex-wrap justify-between gap-2 py-2.5"
                >
                  <span>
                    <strong>
                      {entry.previousStock} → {entry.newStock} units
                    </strong>{" "}
                    • {entry.reason}
                  </span>
                  <span className="text-ink/50">
                    {new Date(entry.changedAt).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink/50">No stock changes recorded for this product yet.</p>
          )}
        </section>
      )}

      {products.data && (
        <div className="mt-5 flex items-center justify-between text-xs text-ink/60">
          <span>
            Page {products.data.pagination.page} of{" "}
            {Math.max(products.data.pagination.pages, 1)} • {products.data.pagination.total} products
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((value) => value - 1)}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= products.data.pagination.pages}
              onClick={() => setPage((value) => value + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

export default function AdminProductsPage() {
  return (
    <AdminShell permission="products.write">
      <ProductsAdmin />
    </AdminShell>
  );
}
