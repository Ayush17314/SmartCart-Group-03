# SmartCart Payment Service

The Payment Service handles payment lifecycle orchestration for SmartCart. It integrates with **Razorpay** for online UPI, card, and net banking transactions, manages **Cash on Delivery (COD)** orders, validates cryptographic webhook events, executes Super Admin refunds, and produces financial reconciliation reports.

---

## Payment Methods & Workflows

### 1. Online Payments (UPI, Cards & Net Banking via Razorpay)
1. **Payment Intent Creation:** During checkout, `order-service` calls `POST /api/payments/create` with an `Idempotency-Key`. The service creates a Razorpay Order via `https://api.razorpay.com/v1/orders` with currency `INR` and amounts converted to paise ($1\text{ INR} = 100\text{ paise}$).
2. **Client Checkout Modal:** The service returns public checkout parameters (`orderId`, `amount`, `currency`, `keyId`) to the frontend Next.js app, which initializes the Razorpay Standard Checkout modal.
3. **Server Signature Verification:** When the customer completes payment, the browser sends the response payload (`razorpay_order_id`, `razorpay_payment_id`, `razorpay_signature`) to `POST /api/payments/verify/:paymentId`.
   - The service calculates `HMAC-SHA256(order_id + "|" + payment_id, RAZORPAY_KEY_SECRET)`.
   - Compares the calculated hash against the received signature using `crypto.timingSafeEqual`.
   - Validates that Razorpay API reports `status: "captured"`.
4. **Order Status Synchronization:** Upon confirmed capture, the service notifies `order-service` via `PATCH /internal/orders/:id/payment` to advance the order to `CONFIRMED` and commit reserved inventory.

### 2. Asynchronous Webhooks
If a customer closes the browser window after completing payment before the verification POST executes:
- Razorpay sends a signed webhook to `POST /api/payments/webhook`.
- The service validates the `X-Razorpay-Signature` against `RAZORPAY_WEBHOOK_SECRET`.
- Processes `payment.captured` and `payment.failed` events to ensure zero order state drift.

### 3. Cash on Delivery (COD)
- Skips Razorpay order creation.
- Stored as `gateway: "OFFLINE"` with `status: "PENDING"`.
- Payment is collected upon delivery and confirmed by staff in the Admin Portal.

### 4. Super Admin Refunds
- Approved customer returns can be refunded via `POST /api/payments/refund/:paymentId` (Super Admin only).
- Implements an atomic database compare-and-set lock (`refundLock: true`) to prevent concurrent or duplicate refund calls to Razorpay.

---

## Environment Configuration

Configure in `Backend/.env`:

```env
PORT=4006
MONGODB_DB=smartcart_payment
JWT_SECRET=a9955a6c8acabae70be5ea1378f14fad75c0c6b761a7dff8e656a1a0a703933c
PAYMENT_SERVICE_SECRET=smartcart-internal-payment-service-secret-2026-key
NOTIFICATION_SERVICE_SECRET=1184921a4210cfae738517065b262c5efc96f5e39b0b0c73519633f184e10e84

# Razorpay Test Mode Credentials
RAZORPAY_KEY_ID=rzp_test_your_key_id
RAZORPAY_KEY_SECRET=your_razorpay_secret
RAZORPAY_WEBHOOK_SECRET=your_webhook_secret_here
RAZORPAY_API_URL=https://api.razorpay.com/v1
RAZORPAY_TIMEOUT_MS=8000
PAYMENT_CURRENCY=INR
```

---

## Endpoints Reference

| Method | Endpoint | Authorization | Purpose |
|:---|:---|:---|:---|
| `GET` | `/health` | Public | Service health check |
| `POST` | `/api/payments/create` | Bearer Token | Create an idempotent Razorpay order (requires `Idempotency-Key`) |
| `POST` | `/api/payments/verify/:paymentId` | Bearer Token | Verify Razorpay checkout signature and confirm capture |
| `POST` | `/api/payments/webhook` | `X-Razorpay-Signature` | Ingest and process asynchronous Razorpay webhook events |
| `GET` | `/api/payments/order/:orderId` | Bearer Token | Retrieve payment status for an order belonging to the user |
| `GET` | `/api/payments/user` | Bearer Token | List all payment transactions for the authenticated customer |
| `POST` | `/api/payments/refund/:paymentId` | Super Admin | Issue a full refund for an approved return via Razorpay |
| `GET` | `/api/payments/admin/reconciliation` | Staff (`analytics.read`) | Paginated payment reconciliation report (supports `format=csv`) |
| `GET` | `/api/payments/admin/audit` | Super Admin (`audit.read`)| Access audit logs for financial reconciliation reports |
