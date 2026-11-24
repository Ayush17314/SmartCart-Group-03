# SmartCart Order Service

The Order Service orchestrates the complete purchasing and fulfillment lifecycle in `smartcart_order`. It coordinates multi-item checkouts, atomic inventory reservations, server-validated coupon promotions, carrier shipment tracking, and 30-day customer returns.

---

## Order Lifecycle & State Machine

```text
              +-------------+
              |   PENDING   | ◄─── Order Created (Inventory Reserved)
              +------+------+
                     |
       Payment Success / Admin Confirm
                     v
              +-------------+
              |  CONFIRMED  | ◄─── Inventory Committed
              +------+------+
                     |
             Shipment Handed to Carrier (Tracking Number Attached)
                     v
              +-------------+
              |   SHIPPED   |
              +------+------+
                     |
             Delivered to Customer
                     v
              +-------------+
              |  DELIVERED  | ───► Customer Return Window Open (30 Days)
              +------+------+         │
                     │                v
                     │         +---------------+
                     │         | RETURN_REVIEW | (Staff Review: Approve/Reject)
                     │         +-------+-------+
                     │                 │
                     │          Inspected & Refunded
                     │                 v
                     │         +---------------+
                     │         |   RETURNED    |
                     │         +---------------+
                     │
         Order Cancelled (Unpaid / Pre-dispatch)
                     v
              +-------------+
              |  CANCELLED  | ◄─── Reserved Stock Released
              +-------------+
```

---

## Promotion & Coupon Engine

Supports server-side coupon validation against active promotions:
- **Discount Types:** Percentage discounts (e.g., `20% OFF`) or Fixed Amount discounts (e.g., `₹500 OFF`).
- **Constraints:** Minimum order subtotal requirement, expiry date (`endsAt`), and overall usage limits.
- **Reservation & Commit:** Coupons are atomically reserved during checkout (`RESERVED`) and permanently marked `COMMITTED` upon successful payment capture.

---

## Environment Configuration

Configure in `Backend/.env` or `Backend/order-service/.env`:

```env
PORT=4005
MONGODB_DB=smartcart_order
JWT_SECRET=a9955a6c8acabae70be5ea1378f14fad75c0c6b761a7dff8e656a1a0a703933c
INVENTORY_SERVICE_SECRET=replace-with-a-different-long-random-shared-secret
PAYMENT_SERVICE_SECRET=smartcart-internal-payment-service-secret-2026-key
NOTIFICATION_SERVICE_SECRET=1184921a4210cfae738517065b262c5efc96f5e39b0b0c73519633f184e10e84
PRODUCT_SERVICE_URL=http://localhost:4002
PAYMENT_SERVICE_URL=http://localhost:4006
NOTIFICATION_SERVICE_URL=http://localhost:4007
```

---

## Endpoints Reference

| Method | Endpoint | Authorization | Purpose |
|:---|:---|:---|:---|
| `GET` | `/health` | Public | Service health check |
| `POST` | `/api/orders` | Customer | Place an order (enforces `Idempotency-Key`) |
| `GET` | `/api/orders` | Customer / Admin | List visible orders (with pagination and status filters) |
| `GET` | `/api/orders/:id` | Owner / Admin | Retrieve full order details |
| `GET` | `/api/orders/:id/tracking` | Owner / Admin | Retrieve current shipment status and full timeline history |
| `PATCH` | `/api/orders/:id/status` | Staff (`orders.manage`) | Advance order state (`CONFIRMED`, `SHIPPED`, `DELIVERED`) |
| `POST` | `/api/orders/:id/cancel` | Owner / Admin | Cancel order and release reserved stock |
| `POST` | `/api/orders/:id/return` | Owner | Submit 30-day return request with reason |
| `PATCH` | `/api/orders/:id/return-review` | Staff (`returns.review`) | Approve or reject a return request |
| `POST` | `/api/orders/:id/return-complete`| Staff (`returns.review`) | Mark inspected return complete |
| `POST` | `/api/promotions/quote` | Public | Validate coupon code and calculate discounted quote |
| `POST` | `/api/promotions` | Staff (`promotions.manage`)| Create a new discount coupon |
| `PATCH` | `/internal/orders/:id/payment` | `PAYMENT_SERVICE_SECRET` | Internal status synchronization called by Payment Service |

---

## Running Tests

```bash
npm test
```
*Executes automated promotion test suite covering coupon quotas, discount bounds, subtotal requirements, and concurrency rules.*
