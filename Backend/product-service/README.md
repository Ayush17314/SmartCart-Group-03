# SmartCart Product Service

The Product Service manages the e-commerce catalog, inventory levels, category taxonomies, customer reviews, and global store settings in the `smartcart_product` MongoDB database.

---

## Core Capabilities

- **Catalog & Search:** Serves product listings with full-text search, category filtering, brand filtering, price sorting, and cursor pagination.
- **Two-Phase Atomic Stock Reservation:** Order Service coordinates with this service via internal endpoints (`/internal/products/reserve`) using atomic Mongoose queries (`stock: { $gte: quantity }`). If an item cannot be reserved, previous reservations in that order are atomically rolled back.
- **Customer Reviews & Ratings:** Verified buyers can submit product reviews and star ratings (1 to 5), which dynamically recalculate the product's average score.
- **Optimistic Concurrency:** Product updates require an `If-Match` header with the current ETag to prevent concurrent overwrites (`412 Precondition Failed`).
- **Store Configuration & Settings:** Provides `/api/settings/public` for tax rates, shipping calculation rules, return policy windows (30 days), and notification preferences.

---

## Catalog Seeding Script

SmartCart includes a built-in seeder that populates 8 realistic products complete with Unsplash images, technical specifications, initial stock, and ratings across Electronics, Fashion, Home, and Beauty:

```bash
node scripts/seed-products.js
```

---

## Environment Configuration

Configure in `Backend/.env` or `Backend/product-service/.env`:

```env
PORT=4002
MONGODB_DB=smartcart_product
JWT_SECRET=a9955a6c8acabae70be5ea1378f14fad75c0c6b761a7dff8e656a1a0a703933c
INVENTORY_SERVICE_SECRET=replace-with-a-different-long-random-shared-secret
CORS_ORIGIN=http://localhost:3000
```

---

## Endpoints Reference

| Method | Endpoint | Access | Purpose |
|:---|:---|:---|:---|
| `GET` | `/health` | Public | Service health check |
| `GET` | `/api/products` | Public | List products with search, category filters, and pagination |
| `GET` | `/api/products/:id` | Public | Retrieve single product details (supports ETag caching) |
| `POST` | `/api/products` | Staff (`products.write`)| Create a new catalog product |
| `PUT` | `/api/products/:id` | Staff (`products.write`)| Update product details (requires `If-Match` ETag) |
| `DELETE`| `/api/products/:id` | Staff (`products.write`)| Archive/soft-delete a product |
| `POST` | `/api/products/:id/reviews` | Customer | Submit a customer rating and review |
| `GET` | `/api/products/:id/reviews` | Public | Retrieve customer reviews for a product |
| `GET` | `/api/settings/public` | Public | Retrieve store identity, return policies, and notification preferences |
| `PUT` | `/api/settings` | Super Admin | Update global store settings |
| `POST` | `/internal/products/reserve` | `INVENTORY_SERVICE_SECRET` | Atomically reserve product stock for an order |
| `POST` | `/internal/products/rollback`| `INVENTORY_SERVICE_SECRET` | Release reserved stock on order cancellation or failure |
| `POST` | `/internal/products/commit` | `INVENTORY_SERVICE_SECRET` | Permanently commit stock on confirmed order payment |
