# SmartCart Auth Service

The Auth Service manages customer and staff identity in `smartcart_auth`. It provides password authentication using bcrypt, Google OAuth token exchange, token-versioned JWT session validation, email verification, and **Email-based 2-Step Verification (MFA)** for Super Administrators.

---

## Authentication & Security Model

- **Bcrypt Password Hashing:** Passwords are never stored in plain text. Hashing is performed with 12 salt rounds.
- **Stateless Tokens with Token Versioning:** JWT tokens encode the user ID and an integer `tokenVersion`. On every protected request, services ask the Auth Service to validate the session. A logout, password change, account suspension, or role update increments `tokenVersion`, instantly invalidating all existing tokens issued to that account.
- **Fail-Closed Design:** If the Auth Service is unreachable, protected routes reject access rather than assuming valid permissions.
- **Portal Separation:** Distinct login routes exist for customers (`/api/auth/customer-login`), staff (`/api/auth/staff-login`), and super administrators (`/api/auth/super-admin-login`). Accounts attempting to log in through the wrong portal receive a descriptive `PORTAL_MISMATCH` error.

---

## Super Admin Two-Factor Authentication (Email 2FA)

Super Administrator accounts are protected by mandatory multi-factor authentication:

1. **Credentials Validation:** The user submits their email and password.
2. **Challenge Creation:** The service generates a cryptographic challenge ID and a random 6-digit verification code. Only SHA-256 hashes of the challenge ID and code are stored in `LoginChallenge`.
3. **Email Dispatch via Resend:**
   - A branded HTML email is dispatched to the admin's verified address with the 6-digit code.
   - **Zero On-Screen Exposure:** The verification code is **never** sent in the API response or displayed on the browser screen.
   - **Sandbox Developer Support:** When using Resend's test domain (`onboarding@resend.dev`), setting `RESEND_DEV_RECIPIENT=your-email@gmail.com` in `Backend/.env` ensures all development login OTPs land directly in your inbox.
4. **Challenge Consumption:** The code expires in 5 minutes, allows at most 5 attempts, and is permanently consumed upon successful verification (`POST /api/auth/super-admin-verify`).

---

## Role-Based Access Control (RBAC)

Defined in [`src/permissions.js`](file:///c:/Users/USER/Desktop/Web%20Services/SmartCart/Backend/auth-service/src/permissions.js):

| Role | Access Portal | Permitted Actions |
|:---|:---|:---|
| **`customer`** | Storefront (`/login`) | `products.read`, `orders.read_own`, `refunds.request` |
| **`support`** | Staff Portal (`/admin/login`) | `products.read`, `orders.read_all`, `customers.read`, `returns.review`, `refunds.request`, `notifications.manage` |
| **`inventory_staff`** | Staff Portal (`/admin/login`) | `products.read`, `products.write`, `inventory.read`, `inventory.write`, `orders.read_all` |
| **`admin`** | Admin Suite (`/admin`) | All staff permissions plus `orders.manage`, `customers.manage`, `promotions.manage`, `reviews.moderate`, `staff.read`, `analytics.read` |
| **`super_admin`** | Super Admin Suite (`/super-admin`) | System-wide permissions (`refunds.approve`, `staff.manage`, `settings.manage`, `audit.read`) |

---

## Initial Setup & Bootstrapping

### 1. Configure Environment Variables
Ensure these variables are present in `Backend/.env`:

```env
MONGODB_URI=mongodb+srv://<user>:<password>@cluster0.mgmdzqg.mongodb.net/
JWT_SECRET=a9955a6c8acabae70be5ea1378f14fad75c0c6b761a7dff8e656a1a0a703933c
AUTH_EXCHANGE_SECRET=local-auth-exchange-secret-change-me

# Super Admin Credentials
SUPER_ADMIN_NAME="Ayush Dubey"
SUPER_ADMIN_EMAIL="ayushdubey1504@gmail.com"
SUPER_ADMIN_PASSWORD="YourSuperSecurePassword123!" # (Min 16 characters)

# Resend Email Integration
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM=onboarding@resend.dev
RESEND_DEV_RECIPIENT=ayushdubey1504@gmail.com
```

### 2. Run the Bootstrap Script
```bash
node scripts/bootstrap-super-admin.js
```
*Creates the verified Super Admin account in `smartcart_auth` if it does not already exist.*

---

## Endpoints Reference

| Method | Endpoint | Access | Purpose |
|:---|:---|:---|:---|
| `POST` | `/api/auth/register` | Public | Customer account registration |
| `POST` | `/api/auth/customer-login` | Public | Storefront customer login |
| `POST` | `/api/auth/staff-login` | Public | Staff portal login (`support`, `inventory_staff`, `admin`) |
| `POST` | `/api/auth/super-admin-login`| Public | Super Admin password validation & email OTP dispatch |
| `POST` | `/api/auth/super-admin-verify`| Public | Verify 6-digit email OTP and issue session token |
| `POST` | `/api/auth/google-login` | Public | Google OAuth credential exchange (Customers & Staff) |
| `GET` | `/api/auth/session` | Bearer Token | Validate current session and retrieve permissions |
| `GET` | `/api/auth/profile` | Bearer Token | Retrieve user profile information |
| `PUT` | `/api/auth/profile` | Bearer Token | Update name or phone number |
| `POST` | `/api/auth/logout` | Bearer Token | Invalidate current session by bumping token version |
| `POST` | `/api/auth/verify-email` | Public | Verify email address with 1-hour token |
| `POST` | `/api/auth/forgot-password` | Public | Request password reset email |
| `POST` | `/api/auth/reset-password` | Public | Reset password using 30-minute token |
| `GET` | `/api/auth/users` | Staff Manage | Paginated listing of staff and customer accounts |
| `POST` | `/api/auth/users/invite` | Super Admin | Send 24-hour staff invitation link via email |
| `PUT` | `/api/auth/users/:id/role` | Super Admin | Change staff member role |
| `PUT` | `/api/auth/users/:id/status`| Super Admin | Activate or suspend an account |
| `GET` | `/api/auth/audit` | Super Admin | Immutable audit log of security events |

---

## Running Tests

```bash
npm test
```
*Runs unit test suites covering RBAC catalogue verification, portal constraints, session validation, and 2FA login challenge enforcement.*
