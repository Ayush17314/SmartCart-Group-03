# SmartCart Backend: Distributed Microservices Architecture

The SmartCart backend is engineered as a decoupled, resilient microservices system running on Node.js and Express. It distributes business capabilities across 8 autonomous domain services, communicating via REST and internal cryptographic service tokens.

---

## Architecture Overview

```
                      +------------------------------------------+
                      |         API Gateway (Port 4000)          |
                      |  - MySQL Idempotency Store / Memory      |
                      |  - Reverse Proxy (http-proxy-middleware) |
                      |  - AJV Request Body Validation           |
                      |  - Rate Limiting & Circuit Breakers      |
                      |  - OpenAPI 3.0 / Swagger UI & GraphQL    |
                      +------------------------------------------+
                                           |
    +------------------+-------------------+------------------+------------------+
    |                  |                   |                  |                  |
    v                  v                   v                  v                  v
+------------+   +------------+      +------------+     +------------+     +------------+
|    Auth    |   |  Products  |      |    Cart    |     |   Orders   |     |  Wishlist  |
| (Port 4001)|   | (Port 4002)|      | (Port 4003)|     | (Port 4005)|     | (Port 4004)|
+------------+   +------------+      +------------+     +------------+     +------------+
                       ^                                      |
                       | [Atomic Stock Reservation]           v
                       +--------------------------------+------------+
                                                        |  Payments  |
                                                        | (Port 4006)|
                                                        +------------+
                                                              |
                                                              v
                                                        +---------------+
                                                        | Notifications |
                                                        | (Port 4007)   |
                                                        +---------------+
```

---

## Services & Ports Reference

| Service | Directory | Port | Database | Responsibilities |
|:---|:---|:---:|:---|:---|
| **API Gateway** | `api-gateway/` | `4000` | MySQL (`smartcart`) / Memory | Central routing entrypoint, versioned `/v1/api` routing, AJV payload validation, rate-limiting, Swagger UI (`/docs`), GraphQL schema (`/graphql`), and MySQL idempotency storage. |
| **Auth Service** | `auth-service/` | `4001` | MongoDB (`smartcart_auth`) | User authentication, bcrypt hashing, Google OAuth token exchange, RBAC permissions, email verification, Super Admin 2FA email OTP. |
| **Product Service** | `product-service/` | `4002` | MongoDB (`smartcart_product`) | Product catalog, text search, categories, inventory levels, atomic conditional stock decrement, customer reviews, store settings. |
| **Cart Service** | `cart-service/` | `4003` | MongoDB (`smartcart_cart`) | Customer shopping carts, line items, quantity mutations, total price computations. |
| **Wishlist Service** | `wishlist-service/` | `4004` | MongoDB (`smartcart_wishlist`) | Customer saved product wishlists and move-to-cart operations. |
| **Order Service** | `order-service/` | `4005` | MongoDB (`smartcart_order`) | Multi-product order creation, stock reservation and rollback orchestration, coupon quote validation, status lifecycle, shipment tracking, return requests. |
| **Payment Service** | `payment-service/` | `4006` | MongoDB (`smartcart_payment`) | Razorpay order creation, HMAC-SHA256 signature verification, webhook processing, Cash on Delivery (COD), Super Admin refund execution, reconciliation reports. |
| **Notification Service** | `notification-service/` | `4007` | MongoDB (`smartcart_notification`) | Event-driven transactional email delivery via Resend, sandbox developer routing, delivery retry worker with exponential backoff. |

---

## Inter-Service Security & Shared Tokens

Services communicate securely without exposing database credentials or user credentials across boundaries:

1. **`AUTH_EXCHANGE_SECRET`:**
   - **Shared by:** Next.js Server $\leftrightarrow$ API Gateway $\leftrightarrow$ Auth Service.
   - **Purpose:** Restricts issuance of JWT session tokens strictly to server-to-server exchanges, ensuring the browser only receives an `HTTP-only` secure cookie.
2. **`INVENTORY_SERVICE_SECRET`:**
   - **Shared by:** Order Service $\leftrightarrow$ Product Service.
   - **Purpose:** Authorizes internal atomic inventory reservations and rollback operations when orders are created, cancelled, or returned.
3. **`PAYMENT_SERVICE_SECRET`:**
   - **Shared by:** Order Service $\leftrightarrow$ Payment Service.
   - **Purpose:** Protects internal payment reconciliation and status synchronization endpoints (`PATCH /internal/orders/:id/payment`).
4. **`NOTIFICATION_SERVICE_SECRET`:**
   - **Shared by:** Auth Service, Order Service, Payment Service $\leftrightarrow$ Notification Service.
   - **Purpose:** Authenticates event notifications (`order.created`, `payment.succeeded`, `security.account_suspended`) sent to the internal notification queue.

---

## Database Architecture

### 1. MongoDB Atlas (with Windows DNS Fallback)
Each service connects to its own isolated logical MongoDB database. Standard Node.js `dns.resolveSrv` lookups for `mongodb+srv://` can time out on Windows machines if the local router DNS does not return SRV records. All SmartCart services include built-in fallback to Google/Cloudflare public DNS:
```javascript
const rawDns = require("dns");
try {
  const nonLocalDns = rawDns.getServers().filter((s) => s !== "127.0.0.1" && s !== "::1");
  rawDns.setServers(["8.8.8.8", "1.1.1.1", ...nonLocalDns]);
} catch {}
```

### 2. MySQL Gateway Idempotency & Audit
The API Gateway connects to MySQL on port `3306` to persist two critical tables:
- `api_idempotency`: Caches `Idempotency-Key` request hashes, responses, and statuses to prevent duplicate order placements and payments.
- `api_audit`: Immutable audit logs capturing every inbound request, method, path, and status.
*Note: In local development without MySQL running, the gateway automatically falls back to an in-memory idempotency store to prevent service interruption.*

---

## Environment Configuration

Copy the sample environment file to create your active configuration:

```bash
cp .env.example .env
```

Key environment variables in `Backend/.env`:

```env
# MongoDB Atlas or Local Connection
MONGODB_URI=mongodb+srv://<username>:<password>@cluster0.mgmdzqg.mongodb.net/

# Email Integration (Resend)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=onboarding@resend.dev
RESEND_DEV_RECIPIENT=your-email@gmail.com

# Inter-Service Cryptographic Secrets
JWT_SECRET=a9955a6c8acabae70be5ea1378f14fad75c0c6b761a7dff8e656a1a0a703933c
AUTH_EXCHANGE_SECRET=local-auth-exchange-secret-change-me
NOTIFICATION_SERVICE_SECRET=1184921a4210cfae738517065b262c5efc96f5e39b0b0c73519633f184e10e84
PAYMENT_SERVICE_SECRET=smartcart-internal-payment-service-secret-2026-key

# Initial Super Admin Account
SUPER_ADMIN_NAME="Ayush Dubey"
SUPER_ADMIN_EMAIL="ayushdubey1504@gmail.com"
SUPER_ADMIN_PASSWORD="YourSuperSecurePassword123!"

# Payment Provider (Razorpay Test Keys)
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

---

## Seeding & Initial Setup

### 1. Seed Product Catalog
Populate the store with realistic catalog items (Electronics, Fashion, Home, Beauty) complete with Unsplash images, specifications, and stock counts:
```bash
cd product-service
node scripts/seed-products.js
```

### 2. Bootstrap Super Admin
Create the initial verified Super Admin user in `smartcart_auth`:
```bash
cd auth-service
node scripts/bootstrap-super-admin.js
```

---

## Running the Backend

### Option A: Docker Compose (All Services & MySQL)
```bash
# From the Backend directory:
docker compose up --build
```
- API Gateway: `http://localhost:4000`
- Swagger UI Docs: `http://localhost:4000/docs`
- GraphQL API: `http://localhost:4000/graphql`

### Option B: Local Node.js Processes
Start each service independently:
```bash
# Terminal 1: API Gateway
cd api-gateway && npm install && npm run dev

# Terminal 2: Auth Service
cd auth-service && npm install && npm run dev

# Terminal 3: Product Service
cd product-service && npm install && npm run dev

# Terminal 4: Cart Service
cd cart-service && npm install && npm run dev

# Terminal 5: Wishlist Service
cd wishlist-service && npm install && npm run dev

# Terminal 6: Order Service
cd order-service && npm install && npm run dev

# Terminal 7: Payment Service
cd payment-service && npm install && npm run dev

# Terminal 8: Notification Service
cd notification-service && npm install && npm run dev
```

---

## Automated Test Suites

```bash
# Run API Gateway tests (routing, idempotency, rate limiting, schemas)
cd api-gateway && npm test

# Run Auth Service tests (RBAC, session validation, 2FA MFA challenges)
cd auth-service && npm test

# Run Order Service tests (Promotions, coupons, discounts)
cd order-service && npm test

# Run Notification Service tests (Queue worker, retries, Resend payload)
cd notification-service && npm test
```
