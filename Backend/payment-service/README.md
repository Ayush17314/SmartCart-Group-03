# Payment Service

The payment service uses Razorpay Orders and Standard Checkout. SmartCart creates the Razorpay order on the server, sends only the public key and order details to the browser, verifies the Checkout signature on the server, and confirms the payment status with Razorpay before marking it successful.

## Configure test mode

1. Copy `Backend/.env.example` to `Backend/.env`.
2. Add your Razorpay **test mode** Key ID and Key Secret from the Razorpay Dashboard. Keep the secret out of the frontend and source control.
3. Set a unique `RAZORPAY_WEBHOOK_SECRET` in the Dashboard webhook configuration and the same value in `Backend/.env`.
4. From `Backend`, run `docker compose up --build`.
5. In the Razorpay Dashboard, configure the webhook URL as `https://<your-public-api-host>/api/payments/webhook` and subscribe to `payment.captured` and `payment.failed`.

For local webhook development, expose the gateway with a secure HTTPS tunnel and use its public URL in the Dashboard. Razorpay sends a signature in `X-Razorpay-Signature`; the service verifies it against the raw request body.

## Checkout flow

The frontend submits an order. The order service asks this service to create the payment using an `Idempotency-Key`. For UPI or card, this service creates a Razorpay Order and returns the public Checkout fields. The browser opens Razorpay Checkout and submits the returned payment ID, order ID, and signature to the server. The server checks the signature against the stored Razorpay order ID, fetches the payment from Razorpay, and only marks it `SUCCESS` after capture. The payment status is then synced to the order service. Webhooks provide an additional status update path.

Cash on delivery skips Razorpay Checkout. Amounts are supplied in rupees by the order service and converted to paise for Razorpay. `PAYMENT_CURRENCY` defaults to `INR`.

## Routes

| Method | Route | Purpose |
| --- | --- | --- |
| `POST` | `/api/payments/create` | Create or retrieve an idempotent Razorpay order; requires `Idempotency-Key` and a bearer token |
| `POST` | `/api/payments/verify/:paymentId` | Verify Razorpay Checkout response; requires a bearer token |
| `POST` | `/api/payments/webhook` | Accept signed Razorpay `payment.captured` and `payment.failed` events |
| `GET` | `/api/payments/order/:orderId` | Retrieve a payment belonging to the authenticated user |
| `GET` | `/api/payments/user` | List the authenticated user’s payments |
| `POST` | `/api/payments/refund/:paymentId` | Submit an approved return's full refund to Razorpay (Super Admin only) |
| `GET` | `/api/payments/admin/reconciliation` | Paginated payment reconciliation report (`analytics.read`); `format=csv` exports at most 5,000 matching records |
| `GET` | `/api/payments/admin/audit` | Read reconciliation export audit records (`audit.read`) |

Use Razorpay test keys and test payment details first. Switch to live keys only after verifying the full flow and configuring the live webhook. This service does not store card numbers. Configure Razorpay capture settings so payments are captured automatically; an authorized but uncaptured payment remains pending in SmartCart.

Refund eligibility is checked with Order Service and requires a reviewed return.
A database compare-and-set lock prevents concurrent full refunds. If the
Razorpay request times out or returns an ambiguous server error, the lock stays
set because the provider may have accepted it; reconcile the provider
transaction before manually clearing the lock. Partial refunds are not
supported.
