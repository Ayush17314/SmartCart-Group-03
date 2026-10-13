import type { Cart, NotificationRecord, Order, OrderQuote, OrderReport, PageResult, PaymentCheckout, PaymentReconciliation, Product, Promotion, Review, SavedAddress, StoreSettings, User, UserRole } from "@/lib/types";

type ApiResult<T> = { success: boolean; data: T; message?: string; pagination?: PageResult<unknown>["pagination"] };
export class ApiError extends Error { constructor(message: string, public status: number) { super(message); this.name = "ApiError"; } }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api/backend${path}`, { ...init, headers: { "Content-Type": "application/json", ...init.headers }, credentials: "same-origin", cache: "no-store" });
  const body = await response.json().catch(() => ({})) as ApiResult<T>;
  if (!response.ok || body.success === false) throw new ApiError(body.message || "Something went wrong. Please try again.", response.status);
  return body.data;
}
async function requestPage<T>(path: string): Promise<{ data: T; pagination?: PageResult<unknown>["pagination"] }> {
  const response = await fetch(`/api/backend${path}`, { headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store" });
  const body = await response.json().catch(() => ({})) as ApiResult<T>;
  if (!response.ok || body.success === false) throw new ApiError(body.message || "Something went wrong. Please try again.", response.status);
  return { data: body.data, pagination: body.pagination };
}
async function requestBlob(path: string): Promise<Blob> {
  const response = await fetch(`/api/backend${path}`, { credentials: "same-origin", cache: "no-store" });
  if (!response.ok) { const body = await response.json().catch(() => ({})); throw new ApiError(body.message || "Could not export report", response.status); }
  return response.blob();
}
const newIdempotencyKey = () => globalThis.crypto.randomUUID();
export const api = {
  products: async (query = ""): Promise<PageResult<Product>> => request(`/api/products${query ? `?${query}` : ""}`),
  product: (id: string) => request<Product>(`/api/products/${encodeURIComponent(id)}`),
  categories: () => request<{ name: string; productCount: number }[]>("/api/products/categories"),
  brands: () => request<{ name: string; productCount: number }[]>("/api/products/brands"),
  cart: () => request<Cart>("/api/cart"),
  addCart: (productId: string, quantity = 1) => request<Cart>("/api/cart/items", { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() }, body: JSON.stringify({ productId, quantity }) }),
  updateCart: (productId: string, quantity: number) => request<Cart>(`/api/cart/items/${encodeURIComponent(productId)}`, { method: "PUT", body: JSON.stringify({ quantity }) }),
  removeCart: (productId: string) => request<Cart>(`/api/cart/items/${encodeURIComponent(productId)}`, { method: "DELETE" }),
  clearCart: () => request<null>("/api/cart", { method: "DELETE" }),
  wishlist: () => request<{ products: string[] }>("/api/wishlist"),
  addWishlist: (id: string) => request<{ products: string[] }>(`/api/wishlist/${encodeURIComponent(id)}`, { method: "POST" }),
  removeWishlist: (id: string) => request<{ products: string[] }>(`/api/wishlist/${encodeURIComponent(id)}`, { method: "DELETE" }),
  orders: (query = "page=1&limit=50") => request<Order[]>(`/api/orders?${query}`),
  adminOrders: (query: string) => requestPage<Order[]>(`/api/orders?${query}`),
  updateOrderStatus: (id: string, body: { status: string; note?: string; shipment?: { carrier: string; trackingNumber: string; trackingUrl?: string } }) => request<Order>(`/api/orders/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify(body) }),
  order: (id: string) => request<Order>(`/api/orders/${encodeURIComponent(id)}`),
  tracking: (id: string) => request<{ orderId: string; status: string; shipment: Order["shipment"]; history: Order["statusHistory"] }>(`/api/orders/${encodeURIComponent(id)}/tracking`),
  createOrder: (body: { items: { productId: string; quantity: number }[]; shippingAddress: Record<string, string>; paymentMethod: "UPI" | "CARD" | "COD"; couponCode?: string }) => request<Order>("/api/orders", { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() }, body: JSON.stringify(body) }),
  applyPromotion: (body: { items: { productId: string; quantity: number }[]; code: string }) => request<OrderQuote & { code: string; eligibleSubtotal: number }>("/api/promotions/apply", { method: "POST", body: JSON.stringify(body) }),
  quoteOrder: (body: { items: { productId: string; quantity: number }[] }) => request<OrderQuote>("/api/orders/quote", { method: "POST", body: JSON.stringify(body) }),
  promotions: () => request<Promotion[]>("/api/promotions?limit=100"),
  createPromotion: (body: Omit<Promotion, "_id" | "usageCount">) => request<Promotion>("/api/promotions", { method: "POST", body: JSON.stringify(body) }),
  updatePromotion: (id: string, body: Omit<Promotion, "_id" | "usageCount">) => request<Promotion>(`/api/promotions/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  storeSettings: () => request<StoreSettings>("/api/settings"),
  publicStoreSettings: () => request<StoreSettings>("/api/settings/public"),
  updateStoreSettings: (body: StoreSettings) => request<StoreSettings>("/api/settings", { method: "PUT", body: JSON.stringify(body) }),
  storeSettingsAudit: () => request<{ _id: string; actorUserId: string; changes: Record<string, { before: unknown; after: unknown }>; changedAt: string }[]>("/api/settings/audit?limit=100"),
  productAudit: () => request<{ _id: string; actorUserId: string; action: string; metadata: Record<string, unknown>; createdAt: string }[]>("/api/products/admin/audit?limit=100"),
  reviews: (productId: string) => request<{ items: Review[]; pagination: PageResult<Review>["pagination"] }>(`/api/products/${encodeURIComponent(productId)}/reviews?limit=20`),
  createReview: (productId: string, body: { rating: number; title: string; body: string }) => request<Review>(`/api/products/${encodeURIComponent(productId)}/reviews`, { method: "POST", body: JSON.stringify(body) }),
  reportReview: (reviewId: string, reason: string) => request<{ reportCount: number; message: string }>(`/api/reviews/${encodeURIComponent(reviewId)}/report`, { method: "POST", body: JSON.stringify({ reason }) }),
  adminReviews: (query: string) => request<{ items: Review[]; pagination: PageResult<Review>["pagination"] }>(`/api/reviews/admin?${query}`),
  moderateReview: (id: string, status: "APPROVED" | "HIDDEN" | "REMOVED", reason: string) => request<Review>(`/api/reviews/${encodeURIComponent(id)}/moderation`, { method: "PATCH", body: JSON.stringify({ status, reason }) }),
  createPayment: (body: { orderId: string; amount: number; paymentMethod: "UPI" | "CARD" | "COD" }, idempotencyKey: string) => request<{ payment: { _id: string; status: string }; checkout: PaymentCheckout | null }>("/api/payments/create", { method: "POST", headers: { "Idempotency-Key": idempotencyKey }, body: JSON.stringify(body) }),
  verifyPayment: (paymentId: string, body: { razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string }) => request<{ payment: { status: string } }>(`/api/payments/verify/${encodeURIComponent(paymentId)}`, { method: "POST", body: JSON.stringify(body) }),
  cancelOrder: (id: string) => request<Order>(`/api/orders/${encodeURIComponent(id)}/cancellation`, { method: "PATCH", body: JSON.stringify({}) }),
  returnOrder: (id: string, reason: string) => request<Order>(`/api/orders/${encodeURIComponent(id)}/returns`, { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() }, body: JSON.stringify({ reason }) }),
  reviewReturn: (id: string, status: "APPROVED" | "REJECTED", note: string) => request<Order>(`/api/orders/${encodeURIComponent(id)}/return-review`, { method: "PATCH", body: JSON.stringify({ status, note }) }),
  completeReturn: (id: string, note: string) => request<Order>(`/api/orders/${encodeURIComponent(id)}/return-complete`, { method: "POST", body: JSON.stringify({ note }) }),
  refundPayment: (paymentId: string) => request<{ _id: string; status: string }>(`/api/payments/${encodeURIComponent(paymentId)}/refunds`, { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() }, body: JSON.stringify({}) }),
  adminNotifications: (query: string) => requestPage<NotificationRecord[]>(`/api/notifications?${query}`),
  retryNotification: (id: string) => request<{ id: string; status: string }>(`/api/notifications/${encodeURIComponent(id)}/retry`, { method: "POST", body: JSON.stringify({}) }),
  profile: () => request<User>("/api/auth/profile"),
  updateProfile: (body: { name?: string; phone?: string; address?: Record<string, string>; addresses?: SavedAddress[] }) => request<User>("/api/auth/profile", { method: "PUT", body: JSON.stringify(body) }),
  adminCustomerSummary: () => request<{ customers: number; newCustomers30d: number }>("/api/auth/admin/summary"),
  adminOrderSummary: (days = 30) => request<{ totalOrders: number; pendingShipments: number; pendingReturns: number; paidOrders: number; pendingPayments: number; failedPayments: number; refundedPayments: number; grossSales: number; discounts: number; taxes: number; shipping: number; refunds: number; netSales: number; trendDays: number; trend: { _id: string; orders: number; sales: number }[] }>(`/api/orders/admin/summary?days=${days}`),
  adminTopProducts: (query = "") => request<{ productId: string; name: string; category: string; unitsSold: number; grossSales: number }[]>(`/api/orders/admin/top-products${query ? `?${query}` : ""}`),
  orderReport: (query: string) => request<OrderReport>(`/api/orders/admin/report?${query}`),
  orderBusinessAudit: () => request<{ items: { _id: string; actorUserId: string; action: string; targetId?: string | null; metadata: Record<string, unknown>; createdAt: string }[]; pagination: PageResult<unknown>["pagination"] }>("/api/orders/admin/audit?limit=100"),
  exportOrderReport: async (query: string) => {
    const response = await fetch(`/api/backend/api/orders/admin/report?${query}&format=csv`, { credentials: "same-origin", cache: "no-store" });
    if (!response.ok) { const body = await response.json().catch(() => ({})); throw new ApiError(body.message || "Could not export report", response.status); }
    return response.blob();
  },
  adminInventorySummary: () => request<{ totalProducts: number; lowStock: number; outOfStock: number; lowStockThreshold: number }>("/api/products/admin/inventory-summary"),
  staff: () => request<User[]>("/api/auth/users"),
  inviteStaff: (body: { name: string; email: string; role: Exclude<UserRole, "customer"> }) => request<{ user: User; developmentEmailPreview?: string }>("/api/auth/users/invite", { method: "POST", body: JSON.stringify(body) }),
  resendStaffInvite: (id: string) => request<{ user: User; developmentEmailPreview?: string }>(`/api/auth/users/${encodeURIComponent(id)}/resend-invite`, { method: "POST", body: JSON.stringify({}) }),
  acceptStaffInvite: (token: string, password: string) => request<{ message: string }>("/api/auth/accept-staff-invite", { method: "POST", body: JSON.stringify({ token, password }) }),
  adminCustomers: (query: string) => requestPage<User[]>(`/api/auth/customers?${query}`),
  exportCustomers: (query: string) => requestBlob(`/api/auth/customers/export?${query}`),
  changeStaffRole: (id: string, role: UserRole) => request<User>(`/api/auth/users/${encodeURIComponent(id)}/role`, { method: "PUT", body: JSON.stringify({ role }) }),
  changeAccountStatus: (id: string, isActive: boolean, reason: string) => request<User>(`/api/auth/users/${encodeURIComponent(id)}/status`, { method: "PATCH", body: JSON.stringify({ isActive, reason }) }),
  authAudit: () => request<{ _id: string; actorUserId: string | null; action: string; targetUserId: string | null; outcome: string; requestId: string | null; metadata: Record<string, unknown>; createdAt: string }[]>("/api/auth/audit?limit=100"),
  adminProducts: (query: string) => request<PageResult<Product>>(`/api/products/admin?${query}`),
  productReport: (query: string) => request<{ items: Product[]; summary: { totalProducts: number; lowStock: number; outOfStock: number; lowStockThreshold: number }; pagination: PageResult<Product>["pagination"] }>(`/api/products/admin/report?${query}`),
  exportProductReport: (query: string) => requestBlob(`/api/products/admin/report?${query}&format=csv`),
  paymentReconciliation: (query: string) => request<PaymentReconciliation>(`/api/payments/admin/reconciliation?${query}`),
  exportPaymentReconciliation: (query: string) => requestBlob(`/api/payments/admin/reconciliation?${query}&format=csv`),
  paymentAudit: () => request<{ _id: string; actorId: string; actorRole: string; action: string; targetType: string; targetId?: string | null; outcome: string; requestId?: string | null; metadata: Record<string, unknown>; createdAt: string }[]>("/api/payments/admin/audit?limit=100"),
  createProduct: (body: Omit<Product, "_id" | "archivedAt"> & { stockAdjustmentReason?: string }) => request<Product>("/api/products", { method: "POST", headers: { "Idempotency-Key": newIdempotencyKey() }, body: JSON.stringify(body) }),
  updateProduct: (id: string, body: Omit<Product, "_id" | "archivedAt"> & { stockAdjustmentReason?: string }) => request<Product>(`/api/products/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(body) }),
  archiveProduct: (id: string) => request<Product>(`/api/products/${encodeURIComponent(id)}`, { method: "DELETE" }),
  setProductArchived: (id: string, archived: boolean) => request<Product>(`/api/products/${encodeURIComponent(id)}/archive`, { method: "PATCH", body: JSON.stringify({ archived }) }),
  inventoryMovements: (id: string) => request<{ actorUserId: string; previousStock: number; newStock: number; reason: string; changedAt: string }[]>(`/api/products/${encodeURIComponent(id)}/inventory-movements`),
};
