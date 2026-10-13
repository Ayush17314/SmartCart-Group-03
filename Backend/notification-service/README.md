# Notification Service

The service persists notification requests in the notification Mongo database
and processes them from a bounded worker queue. Order creation and payment
status changes use a shared event ID, so retries return the original record
instead of creating another email. Delivery attempts and sanitized failure
details are stored in the notification history.

## Providers and delivery states

- Development defaults to `EMAIL_PROVIDER=mock`. Records become `MOCKED`; no
  email is sent and the service does not claim delivery.
- Production requires `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, and
  `EMAIL_FROM`. The queue retries retryable errors up to
  `NOTIFICATION_MAX_ATTEMPTS`, then marks the record `FAILED` for an
  authorized operator to retry.
- `UNCERTAIN` means the provider may have accepted the request but the service
  could not confirm it. Reconcile the provider record before taking action; the
  dashboard deliberately does not offer a blind retry for this state.
- `SENT` means Resend accepted the request and returned a message ID. It does
  not prove inbox delivery. Provider delivery/bounce webhooks are not wired in
  this phase. SMS returns a service-unavailable response because no SMS
  provider is configured.

Resend requests use the persisted notification idempotency key so queue retries
do not intentionally send duplicates. Automatic retry delays are bounded and
stay below Resend's documented 24-hour idempotency retention window. A worker
recovers stale `SENDING` records after a process restart. See Resend's
[idempotency key documentation](https://resend.com/changelog/idempotency-keys)
for provider retention and retry behavior.

## Routes

| Method | Route | Access |
| --- | --- | --- |
| `POST` | `/api/notifications/order` | Internal service token |
| `POST` | `/api/notifications/payment` | Internal service token |
| `POST` | `/api/notifications/email` | `notifications.manage` permission |
| `GET` | `/api/notifications?page=1&limit=20&status=FAILED` | `notifications.manage` permission |
| `POST` | `/api/notifications/:id/retry` | `notifications.manage` permission |

Notification recipients are loaded from Auth Service and must have an active,
verified account. `NOTIFICATION_SERVICE_SECRET` must be shared by Auth,
Order, Payment, and Notification Services; use a strong random value outside
development. The secret is never returned by an API.
