# SmartCart Web: Next.js 15 E-Commerce Storefront & Admin Portal

[![Next.js](https://img.shields.io/badge/Next.js-15.5.27-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.0.0-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Zustand](https://img.shields.io/badge/Zustand-State_Management-brown?style=for-the-badge)](https://zustand-demo.pmnd.rs/)
[![TanStack Query](https://img.shields.io/badge/TanStack_Query-v5-red?style=for-the-badge)](https://tanstack.com/query/latest)

The SmartCart frontend is built with **Next.js 15 App Router**, **React 19**, and **Tailwind CSS v4**. It delivers an Amazon-inspired e-commerce shopping experience for customers and a comprehensive back-office operational suite for store staff and super administrators.

---

## Key Features & Portals

### 1. Customer Storefront (`/`, `/products`, `/cart`, `/checkout`)
- **Interactive Catalog:** Faceted search, category filtering, price bounds, sorting, and cursor-based pagination.
- **Product Details:** High-resolution image galleries, dynamic stock badges, specifications table, and verified customer reviews.
- **Cart & Wishlist:** Real-time quantity adjustments, price calculations, server-validated coupon promotions, and quick move-to-cart operations.
- **Checkout & Payments:**
  - **Online Payments:** Embedded Razorpay modal supporting UPI, credit/debit cards, and net banking with cryptographic signature verification.
  - **Cash on Delivery (COD):** One-click COD checkout with automated stock reservation.
- **Order Tracking:** Detailed visual shipment tracking timeline (`PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `SHIPPED` $\rightarrow$ `DELIVERED`) with carrier tracking numbers.
- **Returns & Support:** Self-service 30-day return request form with customer return reason and note submission.

### 2. Staff Management Portal (`/admin/login`, `/admin/*`)
- **Orders Management (`/admin/orders`):** Advance order statuses, attach carrier details (`carrier`, `trackingNumber`, `trackingUrl`), and inspect customer details.
- **Inventory & Catalog (`/admin/products`):** Manage product listings, update prices, categories, and adjust warehouse stock with low-stock threshold alerts.
- **Returns & Refunds (`/admin`):** Review customer return requests, approve/reject with operational notes, and trigger refund requests.
- **Customer Directory (`/admin/customers`):** View customer order histories and account statuses.
- **Sales & Reconciliation Reports (`/admin/reports`):** Paginated financial reports with CSV export capabilities.

### 3. Super Admin Suite (`/super-admin/dashboard`, `/admin/staff`)
- **Email 2FA / MFA Login Challenge:** Super Admin logins require a one-time 6-digit security code delivered directly to the administrator's email via Resend (zero on-screen code exposure).
- **Staff Governance (`/admin/staff`):** Invite staff members via email, assign roles (`support`, `inventory_staff`, `admin`, `super_admin`), and manage account activations.
- **Refund Authorization:** Authorize and execute direct financial payment refunds through Razorpay.
- **Audit Logs (`/admin/audit`):** Immutable security and administrative audit trail recording actors, actions, targets, and timestamps.
- **Store Settings (`/admin/settings`):** Global store policies, notification preferences, tax rates, and shipping fees.

---

## App Router Directory Structure

```
Frontend/smartcart-web/
├── src/
│   ├── app/                                 # Next.js 15 App Router Routes
│   │   ├── (storefront)/                    # Public Customer Route Group
│   │   │   ├── page.tsx                     # Storefront Landing Page
│   │   │   ├── products/                    # Catalog & Product Details
│   │   │   ├── cart/                        # Shopping Cart
│   │   │   ├── checkout/                    # Multi-step Checkout & Razorpay
│   │   │   ├── orders/                      # Customer Orders & Shipment Tracking
│   │   │   └── wishlist/                    # Saved Items
│   │   ├── (auth)/                          # Authentication Routes
│   │   │   ├── login/                       # Customer & Super Admin Login
│   │   │   ├── register/                    # Customer Registration
│   │   │   ├── verify-email/                # Email Verification Token Handler
│   │   │   └── reset-password/              # Password Reset Flow
│   │   ├── admin/                           # Staff & Admin Operations Suite
│   │   │   ├── login/                       # Dedicated Staff Portal Login
│   │   │   ├── orders/                      # Order Fulfillment & Tracking
│   │   │   ├── products/                    # Inventory & Catalog Management
│   │   │   ├── staff/                       # Staff Invitations & RBAC
│   │   │   ├── reports/                     # Sales & Reconciliation Reports
│   │   │   └── settings/                    # Store Settings & Preferences
│   │   ├── super-admin/                     # Super Admin Governance
│   │   │   └── dashboard/                   # Super Admin Executive Suite
│   │   └── api/                             # Server-side Route Handlers
│   │       ├── auth/                        # Same-origin Auth Proxy & Cookie Session
│   │       └── backend/[...path]/           # Server-side API Gateway Forwarder
│   ├── components/                          # Reusable UI & Layout Components
│   │   ├── auth-form.tsx                    # Multi-portal Authentication & 2FA Form
│   │   ├── navbar.tsx                       # Navigation Header with Cart Badge
│   │   ├── footer.tsx                       # Global Footer
│   │   ├── product-card.tsx                 # Responsive Product Showcase Card
│   │   └── ui/                              # Core Buttons, Inputs, Modals, Badges
│   ├── lib/                                 # Shared Client & Server Utilities
│   │   ├── api.ts                           # Client Fetcher with Auth Interceptors
│   │   ├── auth-route.ts                    # Server-side Auth Exchange Logic
│   │   └── utils.ts                         # Formatting, Classnames, Helpers
│   ├── stores/                              # Zustand State Stores
│   │   ├── cart-store.ts                    # Client Shopping Cart State
│   │   └── auth-store.ts                    # Client User Session State
│   └── styles/                              # Tailwind CSS v4 Stylesheet
├── public/                                  # Static Assets & Icons
├── .env.example                             # Frontend Environment Template
├── .env.local                               # Active Local Configuration
├── package.json                             # Dependencies & Scripts
└── tsconfig.json                            # TypeScript Configuration
```

---

## Authentication & Session Architecture

SmartCart uses an enterprise-grade **HTTP-Only Cookie Session** architecture:

```
[Browser JavaScript]                      [Next.js Server]                     [API Gateway / Auth]
         │                                       │                                       │
         │─── 1. POST /api/auth/login ──────────>│                                       │
         │    { email, password }                │─── 2. POST /api/auth/login ──────────>│
         │                                       │    + X-Auth-Exchange-Secret           │
         │                                       │<── 3. Return JWT Token ───────────────│
         │<── 4. Set-Cookie: smartcart_token ────│
         │    (HTTP-Only, SameSite=Lax, Secure)  │
         │    Return Safe User Profile (No JWT)  │
```

1. The browser submits login credentials to Next.js route handlers (`/api/auth/login`).
2. Next.js validates the credentials against `auth-service` via the API Gateway using a server-only `AUTH_EXCHANGE_SECRET`.
3. Upon success, Next.js sets a 7-day secure `HTTP-only` session cookie (`smartcart_token`).
4. **Security Benefit:** Raw JWT tokens are never accessible to client-side JavaScript, completely neutralizing Cross-Site Scripting (XSS) token theft.

---

## Getting Started

### Prerequisites
* [Node.js](https://nodejs.org/) (v20+ LTS)
* [pnpm](https://pnpm.io/) (v9+) or `npm` (v10+)
* Running SmartCart API Gateway (default: `http://localhost:4000`)

### Installation & Run

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment:**
   Copy `.env.example` to `.env.local`:
   ```bash
   cp .env.example .env.local
   ```
   Ensure `API_URL` points to the API Gateway:
   ```env
   API_URL=http://localhost:4000
   NEXT_PUBLIC_SITE_URL=http://localhost:3000
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=486804727218-a2vuj05ca7sge3jq094tgvbcc2mjigbc.apps.googleusercontent.com
   ```

3. **Start the development server:**
   ```bash
   pnpm dev
   ```
   Open **`http://localhost:3000`** in your browser.

---

## Verification & Build Commands

```bash
# Type check TypeScript files
pnpm typecheck

# Lint codebase
pnpm lint

# Create production build
pnpm build

# Start production server
pnpm start
```
