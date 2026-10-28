# SmartCart: Cloud-Native Microservices E-Commerce Platform

SmartCart is an enterprise-grade, Amazon-inspired e-commerce platform built with a distributed **microservices backend** and a modern **Next.js 15 App Router frontend**. The system features decoupled domain services, an intelligent reverse-proxy API Gateway with dual REST and GraphQL support, dual-phase transaction orchestration, strict Role-Based Access Control (RBAC), multi-channel resilient payments (Razorpay & COD), and transactional notifications (Resend).

---

## Academic Group & Repository Information

- **Group ID:** 05 (TeamID 05)
- **Course Project:** Web Services
- **GitHub Repository:** [https://github.com/Ayush17314/SmartCart](https://github.com/Ayush17314/SmartCart)

### Team Members & Contributions

| # | Name | Roll Number | Assigned Modules |
|---|---|---|---|
| 1 | **Ayush Kumar Dubey** | `20251651030` | `auth-service` & `api-gateway` |
| 2 | **Abhinav Jain** | `20251651003` | `order-service` |
| 3 | **Bharath Kumar MP** | `20251651031` | `product-service` & `frontend (smartcart-web)` |
| 4 | **Anuj Gupta** | `20251651025` | `cart-service` & `wishlist-service` |
| 5 | **Kaushik Nanda Upadhaya** | `20251651050` | `notification-service` |

#### Detailed Member Contributions

#### 1. Ayush Kumar Dubey (`20251651030`)
- **Assigned Modules:** `auth-service` & `api-gateway`
- **Authentication & Security:** Built the user login/signup system with 5 access roles (`customer`, `support`, `inventory_staff`, `admin`, `super_admin`), bcrypt password hashing, and token revocation on logout.
- **Super Admin 2FA:** Implemented email-based two-factor authentication (OTP sent to email via Resend with no on-screen display).
- **API Gateway:** Created the central gateway handling reverse-proxy routing, rate limiting, request validation, and OpenAPI/Swagger documentation (`/docs`).
- **Gateway Idempotency & GraphQL:** Implemented the idempotency store to prevent duplicate requests and added the GraphQL query endpoint.

#### 2. Abhinav Jain (`20251651003`)
- **Assigned Modules:** `order-service`
- **Checkout & Order Creation:** Engineered the order placement flow, calculating totals, taxes, and coordinating with inventory to reserve stock.
- **Order Lifecycle Management:** Built the order state machine (`PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `SHIPPED` $\rightarrow$ `DELIVERED` $\rightarrow$ `CANCELLED`).
- **Shipment Tracking & Returns:** Implemented carrier tracking number updates and the 30-day customer return request and staff review process.
- **Discount & Coupon Engine:** Developed the server-side promotion engine for percentage and fixed discount coupons with minimum spend limits.

#### 3. Bharath Kumar MP (`20251651031`)
- **Assigned Modules:** `product-service` & `frontend (smartcart-web)`
- **Product Catalog & Inventory:** Built the product catalog with category filtering, search, stock tracking, and atomic inventory reservation to prevent overselling.
- **Customer Reviews:** Implemented the rating and review system with automatic average rating calculation.
- **Next.js 15 Storefront:** Developed the customer shopping UI, product pages, cart drawer, checkout screens, and shipment tracking timeline.
- **Admin & Staff Portals:** Built the administrative dashboards for managing products, processing orders, and viewing reports.

#### 4. Anuj Gupta (`20251651025`)
- **Assigned Modules:** `cart-service` & `wishlist-service`
- **Shopping Cart Service:** Created the persistent cart service linking items to user accounts with real-time quantity updates and price calculations.
- **Automated Cart Clearing:** Configured automatic cart cleanup once an order is successfully placed.
- **Wishlist Service:** Built the saved-items service allowing customers to save products and quickly move them to the cart.
- **Data Protection:** Ensured all cart and wishlist endpoints are strictly protected by user token verification.

#### 5. Kaushik Nanda Upadhaya (`20251651050`)
- **Assigned Modules:** `notification-service`
- **Email Notification Pipeline:** Built the notification service listening for order, payment, and shipment status changes.
- **Resend Integration:** Integrated the Resend email API to send automated, professional transactional emails.
- **Queue & Retry Mechanism:** Created a background worker queue that handles delivery retries with exponential backoff if a network error occurs.
- **Delivery Logging & Sandbox Mode:** Built notification delivery tracking and developer sandbox routing for reliable local testing.

---

## System Architecture

The SmartCart platform separates client interfaces, API mediation, and business logic into isolated autonomous components. Cross-service interactions occur strictly over HTTP with shared cryptographic secrets, preventing unauthorized inter-service lateral movement.

```
                          +--------------------------------------------------------+
                          |                   Next.js 15 Web App                   |
                          | (Storefront, Customer Account, Staff & Super Admin UI) |
                          +--------------------------------------------------------+
                                                      |
                                                      | HTTP / HTTPS (Port 3000)
                                                      v
                          +--------------------------------------------------------+
                          |                  API Gateway (Port 4000)               |
                          |  - Routing (/api & /v1/api)     - AJV Schema Validation |
                          |  - Rate Limiting (express)       - Circuit Breakers     |
                          |  - MySQL / Memory Idempotency    - GraphQL (/graphql)   |
                          |  - Swagger UI (/docs)           - Request Correlation  |
                          +--------------------------------------------------------+
                               |            |           |           |           |
       +-----------------------+            |           |           +-----+     +-----------------+
       |                                    |           |                 |                       |
       v                                    v           v                 v                       v
+--------------+                     +--------------+ +---------------+ +---------------+ +--------------------+
| Auth Service |                     | Product Svc  | | Cart Service  | | Order Service | | Notification Svc   |
| (Port 4001)  |                     | (Port 4002)  | | (Port 4003)   | | (Port 4005)   | | (Port 4007)        |
| smartcart_   |                     | smartcart_   | | smartcart_    | | smartcart_    | | smartcart_         |
| auth         |                     | product      | | cart          | | order         | | notification       |
+--------------+                     +--------------+ +---------------+ +---------------+ +--------------------+
       ^                                    ^                                   |                   ^
       |                                    |                                   v                   |
       |                              [Atomic Stock                     +---------------+           |
       |                               Reservation]                     | Payment Svc   |           |
       |                                                                | (Port 4006)   |-----------+
       |                                                                | smartcart_    | [Internal Token:
       |                                                                | payment       |  Order/Payment Alerts]
       |                                                                +---------------+
       |                                                                        |
       +------------------------------------------------------------------------+
```

---

## Microservices Catalog

| Service | Port | Database | Primary Responsibility |
|:---|:---:|:---|:---|
| **API Gateway** | `4000` | MySQL (`smartcart`) / Memory fallback | Central reverse-proxy, versioned routing (`/v1/api` & `/api`), AJV schema validation, rate-limiting, Swagger UI (`/docs`), GraphQL (`/graphql`), and MySQL idempotency storage. |
| **Auth Service** | `4001` | MongoDB (`smartcart_auth`) | User registration, password authentication (bcrypt), Google OAuth token verification, token-versioned JWT management, email verification links, 2FA Super Admin OTP via Resend. |
| **Product Service** | `4002` | MongoDB (`smartcart_product`) | Product catalog, multi-category taxonomy, text search, inventory counts, conditional atomic stock decrement, customer reviews, store settings. |
| **Cart Service** | `4003` | MongoDB (`smartcart_cart`) | Persistent shopping cart per user, line-item quantity management, pricing recalculation. |
| **Wishlist Service** | `4004` | MongoDB (`smartcart_wishlist`) | Customer saved items, wishlist management, quick move-to-cart workflows. |
| **Order Service** | `4005` | MongoDB (`smartcart_order`) | Multi-item checkout orchestration, inventory reservation & rollback, coupon promotions, order status lifecycle, carrier shipment tracking, 30-day returns. |
| **Payment Service** | `4006` | MongoDB (`smartcart_payment`) | Razorpay order creation, HMAC-SHA256 signature verification, webhook processing, Cash on Delivery (COD) management, Super Admin refund execution, reconciliation reports. |
| **Notification Service** | `4007` | MongoDB (`smartcart_notification`) | Event-driven transactional emails via Resend, sandbox developer routing, delivery retry worker with exponential backoff, delivery status tracking. |
| **Frontend Web App** | `3000` | — | Next.js 15 App Router storefront, customer account dashboard, staff operations portal, super admin governance suite. |

---

## Role-Based Access Control (RBAC)

SmartCart implements a 5-tier role hierarchy. Permissions are verified on protected routes by checking cryptographic JWT tokens containing immutable account IDs and token version counters.

```
       [super_admin]
             │ (Inherits all permissions + governance, refunds & audit)
             ▼
          [admin]
             │ (Order lifecycle, promotions, customer reviews, reports)
             ▼
    ┌────────┴────────┐
    ▼                 ▼
[support]      [inventory_staff]
(Returns/Logs) (Stock/Catalog)
    └────────┬────────┘
             ▼
        [customer]
   (Storefront/Orders)
```

| Role | Access Portal | Permissions | Primary Responsibilities |
|:---|:---|:---|:---|
| **`customer`** | Storefront (`/login`, `/account`) | `products.read`, `orders.read_own`, `refunds.request` | Browse & search products, manage cart/wishlist, apply coupons, place orders via Razorpay or COD, track shipments, submit reviews, and request 30-day returns. |
| **`support`** | Staff Portal (`/admin/login`) | `products.read`, `orders.read_all`, `customers.read`, `returns.review`, `refunds.request`, `notifications.manage` | Inspect customer accounts, diagnose order inquiries, review/approve return requests, and inspect notification delivery logs. |
| **`inventory_staff`** | Staff Portal (`/admin/login`) | `products.read`, `products.write`, `inventory.read`, `inventory.write`, `orders.read_all` | Manage product listings, update prices & categories, monitor low-stock threshold alerts, restock inventory, and inspect returned goods. |
| **`admin`** | Admin Suite (`/admin`) | All staff permissions plus `orders.manage`, `customers.manage`, `promotions.manage`, `reviews.moderate`, `staff.read`, `analytics.read` | Advance order statuses (`CONFIRMED` $\rightarrow$ `SHIPPED` $\rightarrow$ `DELIVERED`), assign carrier tracking numbers, create coupon promotions, moderate reviews, and export sales reports. |
| **`super_admin`** | Super Admin Suite (`/super-admin`) | System-wide permissions (`refunds.approve`, `staff.manage`, `settings.manage`, `audit.read`) | Protected by **Email 2FA/MFA**. Provision and invite staff accounts, authorize and execute Razorpay payment refunds, configure store tax/shipping settings, and review immutable security audit logs. |

---

## Core Technical Features

### 1. Robust Authentication & 2-Step Super Admin Verification
- **Cookie-Based Sessions:** The Next.js frontend exchanges successful credentials with `auth-service` via a private `AUTH_EXCHANGE_SECRET` for an `HTTP-only`, `SameSite=Lax` session cookie. Raw JWTs are never exposed in browser JavaScript.
- **Token Versioning:** Passwords resets, logouts, role updates, or account suspensions atomically increment the user's `tokenVersion`, instantly invalidating all outstanding tokens across all services.
- **Super Admin Email 2FA (Zero On-Screen Exposure):** Super Admin logins trigger an automated 6-digit challenge code dispatched directly to the admin's email via Resend. The code expires in 5 minutes, allows max 5 attempts, and is **never** exposed in API responses or on the browser screen.
- **Sandbox Fallback:** During local development with `onboarding@resend.dev`, `RESEND_DEV_RECIPIENT` automatically routes testing OTPs and alerts to the account owner's email.

### 2. Idempotent Order & Payment Orchestration
- **Idempotency-Key Header:** Mutating POST endpoints (`/api/orders`, `/api/payments/create`, `/api/products`, `/api/cart/items`) enforce standard `Idempotency-Key` headers. The API Gateway caches responses in MySQL (or in-memory store) to safely replay identical requests and return `409 Conflict` on payload mismatches.
- **Atomic Two-Phase Inventory Reservation:** When creating an order, `order-service` calls `product-service` with conditional Mongoose queries (`stock: { $gte: quantity }`). If any item is out of stock, all previously reserved items are automatically rolled back.
- **Signature Verification:** Razorpay webhook events and client responses are verified on the server using `crypto.createHmac("sha256", secret)` before payment states advance.

### 3. Enterprise HTTP Semantics & RFC Compliance
- **RFC 7807/9457 Problem Details:** All microservices return uniform error payloads (`application/problem+json`) containing `type`, `title`, `status`, `detail`, `instance`, and correlation `requestId`.
- **Content Negotiation:** Products and Orders endpoints honor `Accept: application/json` and `Accept: application/xml` headers, returning `406 Not Acceptable` for unsupported representations with `Vary: Accept`.
- **Conditional GET & Concurrency:**
  - `ETag` generation on single-item GET requests enables `If-None-Match` conditional caching (`304 Not Modified`).
  - `If-Match` validation on order status updates and product edits enforces optimistic concurrency (`412 Precondition Failed` on stale edits).
- **Rate Limiting:** Protects gateway routes against brute-force attacks, returning `429 Too Many Requests` with standard `RateLimit-*` and `Retry-After` headers.
- **Circuit Breaker:** Outbound calls to payment and order providers are protected by circuit breakers with exponential backoff and timeout abort signals.

---

## Project Structure

```
SmartCart/
├── Backend/
│   ├── api-gateway/               # Reverse Proxy, GraphQL, Swagger UI, Idempotency (Port 4000)
│   ├── auth-service/              # RBAC Identity, Google OAuth, 2FA Email OTP (Port 4001)
│   ├── product-service/           # Catalog, Search, Categories, Reviews, Stock (Port 4002)
│   ├── cart-service/              # Shopping Cart persistence (Port 4003)
│   ├── wishlist-service/          # Customer Wishlists (Port 4004)
│   ├── order-service/             # Order Lifecycle, Coupons, Shipment Tracking (Port 4005)
│   ├── payment-service/           # Razorpay Gateway, Webhooks, Refunds, COD (Port 4006)
│   ├── notification-service/      # Resend Transactional Emails, Worker Queue (Port 4007)
│   ├── .env                       # Backend Master Environment Variables
│   ├── .env.example               # Backend Environment Template
│   ├── docker-compose.yml         # Multi-container orchestration (All services + MySQL)
│   └── SmartCart.postman_collection.json # Comprehensive Postman API collection
├── Frontend/
│   └── smartcart-web/             # Next.js 15 (App Router), React 19, Tailwind CSS v4 (Port 3000)
├── docs/                          # Architectural, UML, and Specification documents
└── README.md                      # Flagship Project Documentation
```

---

## Quick Start Guide

### Prerequisites
* [Node.js](https://nodejs.org/) (v20+ LTS recommended)
* [pnpm](https://pnpm.io/) (v9+) or `npm` (v10+)
* [MongoDB](https://www.mongodb.com/) (Local instance on `localhost:27017` or MongoDB Atlas Cluster)
* [Docker Desktop](https://www.docker.com/) (Optional, for containerized run)

---

### Step 1: Environment Configuration

Copy the backend environment template to create your live configuration:

```bash
cp Backend/.env.example Backend/.env
```

Ensure the following key variables are configured in `Backend/.env`:

```env
# Database Connection (MongoDB Atlas or Local)
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mgmdzqg.mongodb.net/

# Email Provider Configuration (Resend)
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=onboarding@resend.dev
RESEND_DEV_RECIPIENT=your-email@gmail.com

# Inter-Service Shared Secrets (Min 32 characters)
JWT_SECRET=a9955a6c8acabae70be5ea1378f14fad75c0c6b761a7dff8e656a1a0a703933c
AUTH_EXCHANGE_SECRET=local-auth-exchange-secret-change-me
NOTIFICATION_SERVICE_SECRET=1184921a4210cfae738517065b262c5efc96f5e39b0b0c73519633f184e10e84
PAYMENT_SERVICE_SECRET=smartcart-internal-payment-service-secret-2026-key

# Initial Super Admin Account Credentials
SUPER_ADMIN_NAME="Ayush Dubey"
SUPER_ADMIN_EMAIL="ayushdubey1504@gmail.com"
SUPER_ADMIN_PASSWORD="YourSuperSecurePassword123!"

# Razorpay Test Mode Credentials (Optional for Online Payments; COD works out of the box)
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
```

---

### Step 2: Seed Products & Bootstrap Super Admin

1. **Populate the Product Catalog:**
   ```powershell
   cd "Backend\product-service"
   node scripts/seed-products.js
   ```
   *Connects to MongoDB and seeds 8 realistic products across Electronics, Fashion, Home, and Beauty.*

2. **Bootstrap the Super Admin Account:**
   ```powershell
   cd "..\auth-service"
   node scripts/bootstrap-super-admin.js
   ```
   *Creates the verified Super Admin account in `smartcart_auth`.*

---

### Step 3: Run the Application

#### Option A: Running with Docker Compose (Recommended)
From the root directory:
```bash
cd Backend
docker compose up --build
```
This starts:
- MySQL 8.0 on port `3306`
- MongoDB on port `27017`
- All 8 microservices and API Gateway on port `4000`

In a separate terminal, start the Next.js frontend:
```bash
cd Frontend/smartcart-web
pnpm install
pnpm dev
```
Open **`http://localhost:3000`** in your browser.

---

#### Option B: Running Locally (Separate Processes)
If running without Docker, start services in separate terminals:

1. **API Gateway (Port 4000):**
   ```bash
   cd Backend/api-gateway && npm install && npm run dev
   ```
2. **Auth Service (Port 4001):**
   ```bash
   cd Backend/auth-service && npm install && npm run dev
   ```
3. **Product Service (Port 4002):**
   ```bash
   cd Backend/product-service && npm install && npm run dev
   ```
4. **Cart Service (Port 4003):**
   ```bash
   cd Backend/cart-service && npm install && npm run dev
   ```
5. **Wishlist Service (Port 4004):**
   ```bash
   cd Backend/wishlist-service && npm install && npm run dev
   ```
6. **Order Service (Port 4005):**
   ```bash
   cd Backend/order-service && npm install && npm run dev
   ```
7. **Payment Service (Port 4006):**
   ```bash
   cd Backend/payment-service && npm install && npm run dev
   ```
8. **Notification Service (Port 4007):**
   ```bash
   cd Backend/notification-service && npm install && npm run dev
   ```
9. **Next.js Frontend (Port 3000):**
   ```bash
   cd Frontend/smartcart-web && pnpm install && pnpm dev
   ```

---

## Interactive API Documentation & Testing

- **Swagger UI:** Accessible interactively at [http://localhost:4000/docs](http://localhost:4000/docs)
- **OpenAPI 3.0 Specification:** Available at `http://localhost:4000/openapi.json`
- **GraphQL Endpoint & GraphiQL:** Accessible at `http://localhost:4000/graphql`
- **Postman Collection:** Import [`Backend/SmartCart.postman_collection.json`](file:///c:/Users/USER/Desktop/Web%20Services/SmartCart/Backend/SmartCart.postman_collection.json) to execute pre-configured requests across all services.

### Running Test Suites
```bash
# Run API Gateway integration tests (AJV schemas, idempotency, routing, caching)
cd Backend/api-gateway
npm test

# Run Auth Service tests (RBAC validation, session enforcement, MFA challenges)
cd ../auth-service
npm test

# Run Order Service tests (Promotions, coupon quotas, discount calculations)
cd ../order-service
npm test

# Run Notification Service tests (Worker queue, retry logic, Resend dispatch)
cd ../notification-service
npm test
```

---

## Web Services Course Implementation Checklist

Below is the verified implementation audit organized assignment-wise across SmartCart:

### Assignment 1: HTTP by Hand & Project Setup
- **Status:** **Fully Implemented**
- Git repository initialized with structured directories, clean `.gitignore`, isolated service environments, and reproducible commit history.

### Assignment 2: Design Project — Services, Contracts & Schema
- **Status:** **Fully Implemented**
- 8 autonomous microservices: Gateway, Auth, Products, Cart, Wishlist, Orders, Payments, Notifications.
- Zero shared database collections; strict domain boundary isolation.
- Contract-level inter-service communication solely over HTTP with cryptographic bearer/service tokens.

### Assignment 3: Integrate an External Partner
- **Status:** **Fully Implemented (Modern REST/JSON Partner)**
- Razorpay payment gateway integration with order creation, HMAC-SHA256 signature validation, and webhooks.
- Resend email gateway integration with bounded worker retry queue and sandbox fallback.

### Assignment 4: Rebuilding a Project Service in REST (Orders Service)
- **Status:** **Fully Implemented**
- Plural, resource-oriented endpoint design (`/api/orders`, `/api/orders/:id`, `/api/orders/:id/tracking`, `/api/orders/:id/status`).
- OpenAPI contract served via Swagger UI at `/docs`.
- Standard `Idempotency-Key` enforcement on order creation with replay cache.
- Network resilience via timeout signals, exponential backoff retries, and circuit breaker protection.

### Assignment 5: HTTP Methods & Headers
- **Status:** **Fully Implemented**
- Explicit `OPTIONS` route handlers returning `204 No Content` and `Allow` headers.
- Content Negotiation supporting `Accept: application/json` and `application/xml` with `Vary: Accept`.
- Conditional caching via `ETag` and `If-None-Match` (`304 Not Modified`).
- Optimistic concurrency control via `If-Match` on status changes and product edits (`412 Precondition Failed`).
- Standard rate limiting returning `429 Too Many Requests` with `RateLimit-*` and `Retry-After` headers.

### Assignment 6: Honest Responses: Status Codes, Errors & Validation
- **Status:** **Fully Implemented**
- Honest HTTP status codes throughout (200, 201, 304, 400, 401, 403, 404, 406, 409, 412, 422, 429, 500, 502, 503, 504).
- `Location` header on `201 Created` pointing to canonical resource URI.
- RFC 7807/9457 Problem Details (`application/problem+json`) with stable machine-readable error codes.
- Comprehensive multi-field schema validation via AJV returning structured error arrays.

---

## License

This project is licensed under the MIT License. Developed for academic submission and demonstration.
