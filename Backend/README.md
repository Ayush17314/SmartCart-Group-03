# SmartCart Backend

SmartCart uses a Node.js and Express microservices backend. Each domain service
owns a MongoDB database and exposes REST. The gateway exposes both `/api` legacy
paths and the versioned `/v1/api` API, adds shared middleware and GraphQL, and
uses MySQL for durable gateway idempotency and request audit rows.

## Services

| Service | Port | Database | Responsibility |
| --- | ---: | --- | --- |
| API Gateway | 4000 | MySQL | Versioned REST routing, rate limiting, GraphQL, docs |
| Auth | 4001 | `smartcart_auth` | Registration, login, profiles, roles |
| Products | 4002 | `smartcart_products` | Catalog, search, inventory |
| Cart | 4003 | `smartcart_cart` | Customer shopping carts |
| Wishlist | 4004 | `smartcart_wishlist` | Saved products |
| Orders | 4005 | `smartcart_orders` | Checkout records, lifecycle, shipment tracking |
| Payments | 4006 | `smartcart_payments` | Payment intents and payment status |
| Notifications | 4007 | `smartcart_notifications` | Notification requests |

## Run locally

1. Set the shared `MONGODB_URI` in `Backend/.env` to Atlas or your local MongoDB
   URI. Each service selects its own database name with `MONGODB_DB`.
2. Copy each service's `.env.example` to `.env` and set a strong shared
   `JWT_SECRET`. Set the same `AUTH_EXCHANGE_SECRET` for the Next.js server,
   Gateway, and Auth Service, and the same `INVENTORY_SERVICE_SECRET` for Order
   and Product Services.
3. Run `npm install` and then `npm start` in each service directory.
4. Send requests through `http://localhost:4000`.

To start the complete stack with Docker Compose, copy `.env.example` to `.env`,
set `MONGODB_URI`, then run `docker compose up --build` from this directory. Set the JWT, SQL, and
Razorpay secrets before using the stack outside local development. The Compose
fallback secrets are for development only. API docs are served at `/docs` and
the handwritten specification at `/openapi.json`.

## Authentication

The Next.js app sends authentication requests through same-origin API routes. The trusted Next.js server exchanges a successful login for a seven-day, HTTP-only cookie; the browser receives only a safe user profile. Direct login calls to the gateway or Auth Service do not return a JWT without the server-only `AUTH_EXCHANGE_SECRET`.

Register with `POST /api/auth/register`:

```json
{
  "name": "Ada",
  "email": "ada@example.com",
  "password": "password123"
}
```

Backend service clients can use a JWT on protected routes:

```http
Authorization: Bearer <token>
```

Public registration always creates an unverified customer account. It cannot set
roles. The Auth Service sends a verification link through the configured email
provider before login is allowed. In development, the mock email provider
returns a local-only link; it does not send mail.

The JWT is held in an HTTP-only, seven-day cookie by the Next.js server. Each
protected service validates the token with the Auth Service, which checks the
current account state, token version, and permission policy. Logout, password
reset, suspension, and role changes revoke prior tokens. The one-time backfill
and Super Admin bootstrap commands, plus email provider setup, are documented in
the [Auth Service guide](auth-service/README.md).

## Orders and shipment tracking

Create an order with `POST /api/orders`. The service loads current product
prices, then asks Product Service to reserve each requested quantity with an
atomic conditional stock decrement before saving the order. Reservation
requests are idempotent by order ID; partial reservations are compensated if
another item is unavailable. A failed order save triggers a release attempt.
Cancellation releases an unpaid order's reservation, while payment success or
order confirmation commits it. The separate `INVENTORY_SERVICE_SECRET` must be
shared only by Order Service and Product Service. Payment initialization is
initialized after order creation. UPI and card orders include Razorpay Checkout
details for the browser; the payment service verifies the returned signature and
syncs captured payment status back to the order. If the provider is temporarily
unavailable, the saved order remains available with `paymentStatus: PENDING`.

Customers can access only their own orders. Admins can list all orders and filter
by status. Lists accept `page` and `limit` query parameters, with a maximum page
size of 100.

| Method | Route | Access | Purpose |
| --- | --- | --- | --- |
| `POST` | `/api/orders` | Customer | Create an order |
| `GET` | `/api/orders?page=1&limit=20` | Customer or admin | List visible orders |
| `GET` | `/api/orders/:id` | Owner or admin | Get order details |
| `GET` | `/api/orders/:id/tracking` | Owner or admin | Get current shipment and status history |
| `PATCH` | `/api/orders/:id/status` | Admin | Advance the order and add a history event |
| `POST` | `/api/orders/:id/cancel` | Owner or admin | Cancel an eligible order |
| `POST` | `/api/orders/:id/return` | Owner | Request a return within 30 days of delivery |
| `PATCH` | `/api/orders/:id/return-review` | Support, admin, or Super Admin | Approve or reject a pending return request |
| `POST` | `/api/orders/:id/return-complete` | Support, admin, or Super Admin | Mark an approved return received and inspected |

Statuses follow this lifecycle:

```text
PENDING -> CONFIRMED -> SHIPPED -> DELIVERED
    |           |             return request -> APPROVED -> COMPLETED/RETURNED
    +-> CANCELLED <-+
```

The admin status request accepts a `note`. Moving an order to `SHIPPED` also
requires shipment details:

```json
{
  "status": "SHIPPED",
  "note": "Handed to the carrier",
  "shipment": {
    "carrier": "Example Carrier",
    "trackingNumber": "SC-123456",
    "trackingUrl": "https://carrier.example/track/SC-123456"
  }
}
```

Every status change records the actor, timestamp, status, and optional note in
`statusHistory`. Customers can retrieve this history from the tracking route.
Only valid status transitions are accepted.
Return requests have a separate review history and do not mark an order returned
until staff records receipt. Returned goods that pass inspection must be added
back through the Inventory screen with an audited reason; payment refunds remain
a separate privileged payment operation.

## Other APIs

- Products support search and cursor pagination, for example
  `GET /v1/api/products?limit=20&search=phone&category=electronics`; follow the
  returned `Link: rel="next"` URL for the next page.
- Cart and wishlist routes require a bearer token.
- Notifications persist order, payment, shipment, return, refund, and security
  events. Development records `MOCKED` notifications without sending email;
  production uses Resend with bounded retries, provider idempotency, and an
  admin delivery queue. `SENT` means provider acceptance, not inbox delivery.
  SMS remains unconfigured.
- GraphQL products are available at `POST /graphql`. GraphiQL is enabled
  outside production.
- Gateway POST resource creation uses an `Idempotency-Key` header and records
  replay responses in MySQL. `GET` responses carry cache policy and ETags; the
  product list supports JSON and XML representations.

## Development notes

- All services expose `/health` endpoints.
- Razorpay test keys simulate payments without moving real funds. Configure test
  keys and webhook secrets before using checkout; see
  [the payment service guide](payment-service/README.md).
- Reservations remain held while an order is awaiting payment. Add a bounded
  expiry/reconciliation worker before production to release abandoned unpaid
  orders and repair cross-service failures; the current flow compensates
  synchronous failures and supports idempotent cancellation retries.
- Configure real notification, payment, and carrier integrations before
  production use.
