# SmartCart Notification Service

The Notification Service manages event-driven transactional email communications across the SmartCart platform. It persists notification requests in `smartcart_notification` and processes them via a resilient background worker queue with exponential backoff retries.

---

## Core Capabilities

- **Event-Driven Architecture:** Listens to platform events (`order.created`, `order.cancelled`, `payment.succeeded`, `payment.failed`, `shipment.updated`, `return.updated`, `security.account_suspended`).
- **Resend Email Integration:** Dispatches emails through the official Resend API using standard HTTP POST requests with provider idempotency headers.
- **Sandbox Developer Routing (`RESEND_DEV_RECIPIENT`):** When testing in development using Resend's free sandbox domain (`onboarding@resend.dev`), setting `RESEND_DEV_RECIPIENT` automatically forwards notifications to your registered email to prevent Resend's 403 sandbox restriction.
- **Provider Idempotency:** Passes the notification's unique `idempotencyKey` to Resend's API (`Idempotency-Key: <key>`), ensuring network retries within 24 hours never dispatch duplicate emails to customers.
- **Stale Lease Recovery:** Automatically recovers stale `SENDING` notifications on service restart or worker crashes.

---

## Delivery States

| Status | Meaning | Action / Handling |
|:---|:---|:---|
| `QUEUED` | Pending worker pick-up or scheduled for a retry attempt. | Worker processes immediately or after exponential delay (`nextAttemptAt`). |
| `SENDING` | Leased by the queue worker; HTTP dispatch in progress. | Converted to `QUEUED` if lease expires (> 2 minutes) without completion. |
| `SENT` | Successfully accepted by Resend with a returned message ID. | Completed. Provider message ID logged in record. |
| `MOCKED` | Recorded in local development when `EMAIL_PROVIDER=mock`. | No actual email dispatched; preview recorded in audit history. |
| `SKIPPED` | Delivery suppressed by customer's store notification preferences. | Handled gracefully without retry. |
| `FAILED` | Maximum attempts (`NOTIFICATION_MAX_ATTEMPTS`, default: 5) exceeded. | Retained for inspection; can be manually requeued by staff. |
| `UNCERTAIN` | Provider returned 5xx or timed out during dispatch. | Reconciled manually before blind re-attempt to avoid duplicate emails. |

---

## Environment Configuration

Configure in `Backend/.env`:

```env
PORT=4007
MONGODB_DB=smartcart_notification
NOTIFICATION_SERVICE_SECRET=1184921a4210cfae738517065b262c5efc96f5e39b0b0c73519633f184e10e84

# Email Provider Configuration
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=onboarding@resend.dev
RESEND_DEV_RECIPIENT=ayushdubey1504@gmail.com
EMAIL_TIMEOUT_MS=8000
NOTIFICATION_MAX_ATTEMPTS=5
```

---

## Endpoints Reference

| Method | Endpoint | Authorization | Purpose |
|:---|:---|:---|:---|
| `GET` | `/health` | Public | Service health check |
| `POST` | `/api/notifications/order` | `X-Service-Token` | Internal trigger for order creation and cancellation notifications |
| `POST` | `/api/notifications/payment` | `X-Service-Token` | Internal trigger for payment success, failure, and refund notifications |
| `POST` | `/api/notifications/email` | `notifications.manage` | Administrative trigger for custom transactional emails |
| `GET` | `/api/notifications` | `notifications.manage` | Paginated listing of notification records with status filters |
| `POST` | `/api/notifications/:id/retry` | `notifications.manage` | Requeue a `FAILED` notification for immediate redelivery |

---

## Running Tests

```bash
npm test
```
*Executes unit tests covering queue worker polling, retry intervals, idempotency deduplication, and Resend delivery mocks.*
