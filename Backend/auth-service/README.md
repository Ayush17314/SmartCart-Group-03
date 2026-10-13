# Auth Service

The Auth Service owns customer and staff accounts in `smartcart_auth`. Passwords
are bcrypt hashes; JWTs contain a user ID and token version, not a trusted role.
Protected services ask this service to validate the JWT and return the current
permissions. A role change, suspension, password reset, or logout increments the
token version, so previously issued tokens stop working on the next request.

## Account flows

- Public registration always creates an active `customer` with
  `emailVerified: false`. The request allowlists name, email, and password; a
  submitted role is never copied into the account.
- Verification tokens are 256-bit random values. Only SHA-256 hashes are stored;
  links expire after one hour and are single use.
- Customer, staff, and Super Admin login routes are separate and each checks
  the provisioned database role. Wrong credentials and inactive/unverified
  accounts receive the generic invalid-credentials response; a valid account
  using the wrong portal receives a clear portal-mismatch response. Login,
  verification resend, and recovery routes have process-local limits as well as
  the gateway limit.
- Super Admin password login starts a second step by emailing a random six-digit
  code to the verified account address. Only the code hash and challenge hash
  are stored; challenges expire after five minutes, allow at most five guesses,
  and are consumed once. The HTTP-only session is issued only after code
  verification. Production therefore requires a working email provider.
- Password reset tokens are hashed, expire after 30 minutes, and can be used
  once. A successful reset changes the password and revokes all sessions.
- Logout revokes the current account's token version and clears the frontend
  cookie. Existing JWTs are checked against the Auth Service on every protected
  service request. This is deliberately fail-closed if Auth is unavailable.

## Email provider

Development defaults to `EMAIL_PROVIDER=mock`. It does not send email; the
frontend shows development-only previews for verification/reset links and the
Super Admin code. Production startup requires the Resend adapter and these values:

```env
NODE_ENV=production
AUTH_EXCHANGE_SECRET=a-separate-random-secret-of-at-least-32-characters
EMAIL_PROVIDER=resend
RESEND_API_KEY=your-provider-secret
EMAIL_FROM=SmartCart <accounts@example.com>
NEXT_PUBLIC_SITE_URL=https://your-store.example
```

The provider secret stays in the Auth Service environment. It is not returned
to the browser or written to logs. The implementation currently supports Resend;
configure a different provider by adding an adapter rather than using the mock
in production.

`AUTH_EXCHANGE_SECRET` must be shared by the Next.js server, API Gateway, and
Auth Service. The Gateway forwards it only on login and Super Admin code
verification requests that already proved possession of the secret; Auth
Service returns the JWT only for that server-to-server exchange. Use a separate
random secret in production and keep it out of all `NEXT_PUBLIC_` variables.

## Existing accounts and Super Admin setup

After backing up the auth database and deploying the new schema, run the
repeatable backfill once. It sets missing `isActive`, `emailVerified`, and
`tokenVersion` values on existing accounts, preserving existing `customer` and
`admin` roles. Legacy accounts are marked verified to avoid locking them out.
Existing administrators remain ordinary `admin` accounts; none are promoted
automatically.

```sh
cd Backend
docker compose up -d mongodb
docker compose run --rm auth-service npm run migrate:auth
```

To create the first Super Admin, set a new `JWT_SECRET` with at least 32 random
characters plus `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, and a unique
`SUPER_ADMIN_PASSWORD` of at least 16 characters in `Backend/.env`, then run:

```sh
docker compose up -d mongodb
docker compose run --rm auth-service npm run bootstrap:super-admin
```

The command refuses to elevate or overwrite an existing account. It does not
print the password or a session token. Remove the bootstrap password from the
environment file after it succeeds. Further Super Admin grants are restricted
to an already authenticated Super Admin and are recorded in the auth audit log.

## Role policy and endpoints

The canonical role/permission catalogue is in `src/permissions.js`. The five
roles are `customer`, `support`, `inventory_staff`, `admin`, and `super_admin`.
Refund approval, settings, and audit-log access are reserved for Super Admins;
ordinary admins do not inherit those permissions.

Endpoints include register/login/session/profile/logout, verify and resend
email, forgot/reset password, customer/staff listing, 24-hour staff invitation
and acceptance, role and account-status management, the admin customer summary,
and auth audit reads. Invitation tokens are stored hashed, accepted atomically
once, and never returned outside development email previews. Sensitive account
changes write append-only `AuthAuditEvent` records with actor, target, outcome,
request ID, timestamp, and sanitized metadata.

Rate-limit counters and the gateway circuit/rate-limit state are process-local.
Use a shared store before horizontally scaling these services. Only Super Admins
have `staff.manage`; only they can invite staff or change staff roles. An Admin
can view staff and manage accounts within its other assigned permissions.

This upgrade phase also does not implement promotions/coupon redemption,
reviews and moderation screens, store settings, product image uploads, a
return-review/refund approval workflow, or delivery retries for real email or
SMS providers. Notifications are recorded as queued requests; this does not
claim that an email or SMS was delivered. Order checkout still checks available
stock but does not reserve it atomically, so concurrent checkouts can oversell.
