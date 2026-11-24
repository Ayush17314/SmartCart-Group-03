# SMARTCART DISTRIBUTED E-COMMERCE PLATFORM
## Technical Engineering & System Design Interview Preparation Report
**Assigned Modules:** `auth-service` (Port 4001) & `api-gateway` (Port 4000)  
**Candidate / Engineering Lead:** Ayush Dubey (TeamID 03)  
**PDF Deliverable:** [`docs/SmartCart_Auth_and_APIGateway_Interview_Report.pdf`](file:///c:/Users/USER/Desktop/Web%20Services/SmartCart/docs/SmartCart_Auth_and_APIGateway_Interview_Report.pdf)

---

## 1. Executive Summary & Candidate Elevator Pitch

### 60-Second Interview Elevator Pitch
> *"In the SmartCart distributed e-commerce platform, I owned and engineered two foundational infrastructural pillars: the **API Gateway** and the **Authentication & Identity Service**. The API Gateway serves as our high-performance reverse-proxy choke-point handling sliding-window rate limiting, schema boundary guards via AJV, OpenAPI/Swagger 3.0 documentation, Circuit Breaker resilience, and a durable MySQL-backed idempotency store to prevent duplicate orders and double billing. The Auth Service enforces a 5-tier Role-Based Access Control hierarchy, bcrypt password hashing with constant-time dummy comparisons, instant session revocation using token versioning, and an out-of-band email-based Two-Factor Authentication system for Super Administrators where OTP codes are dispatched via Resend and never exposed in browser or API payloads."*

---

## 2. Architectural Placement & Persistence Boundaries

SmartCart strictly enforces the **Database-per-Service Pattern**. The two assigned modules maintain separate, decoupled persistence layers to prevent data cross-contamination and horizontal scaling bottlenecks:

| Subsystem Module | Network Port | Backing Data Store | Core Responsibilities |
| :--- | :---: | :--- | :--- |
| **api-gateway** | `4000` | **MySQL 8.4 Server**<br>(InnoDB Engine: `smartcart`) | Reverse proxying, path rewriting, sliding-window rate limiting (120 req/60s), durable idempotency (`api_idempotency`), request auditing (`api_audit`), Circuit Breaker resilience, unified GraphQL facade. |
| **auth-service** | `4001` | **MongoDB Community 7.0**<br>(WiredTiger: `smartcart_auth`) | User identity lifecycle, 5-role RBAC, bcrypt credential hashing (work factor 12), token versioning, Super Admin 2FA challenges, staff invitation lifecycles, and audit logging. |

---

## 3. Module 1: Authentication & Identity Service (`auth-service`)

### 3.1 Role-Based Access Control (RBAC) & Portal Access Isolation
The system defines 5 discrete operational personas mapped to an immutable hierarchy of 20 granular permissions (`permissions.js`). Authentication requests are strictly partitioned into role-specific portal endpoints (`portalAllowsRole`) to prevent privilege escalation:

| Role Identifier | Portal Gateway | Granular Permissions & System Capabilities |
| :--- | :--- | :--- |
| `customer` | `/api/auth/customer-login` | Storefront consumer. Permissions: `products.read`, `orders.read_own`, `refunds.request`. |
| `support` | `/api/auth/staff-login` | Customer care staff. Read-only order/profile inspection, return evaluation: `orders.read_all`, `returns.review`. |
| `inventory_staff` | `/api/auth/staff-login` | Warehouse personnel. Catalog item CRUD and stock count updates with mandatory audit notes: `products.write`, `inventory.write`. |
| `admin` | `/api/auth/staff-login` | Store operations manager. Order dispatch lifecycle (`CONFIRMED` $\rightarrow$ `SHIPPED` $\rightarrow$ `DELIVERED`), promotions, reviews: 16 permissions. |
| `super_admin` | `/api/auth/super-admin-login` | Platform governance owner. Wildcard (`*`) system privileges. Requires mandatory email 2FA verification. |

### 3.2 Cryptographic Password Hashing & Timing Attack Prevention
Credentials are hashed using `bcryptjs` with a work factor of 12 salt rounds (`bcrypt.hash(password, 12)`). To eliminate side-channel **timing attacks** (where attackers deduce existing email addresses by measuring the execution time differences between instant failed lookups and intensive bcrypt comparisons), the service precomputes a dummy hash at server startup:

```javascript
// Timing Attack Mitigation in auth-service
const dummyPasswordHash = bcrypt.hashSync("smartcart-invalid-login-dummy", 12);

// Even if user record is null, bcrypt.compare is still executed against dummy hash
const passwordMatches = await bcrypt.compare(
    String(req.body.password || ""),
    user?.password || dummyPasswordHash
);
if (!user || !passwordMatches) {
    return res.status(401).json({ success: false, message: "Invalid email or password." });
}
```

### 3.3 Instant Token Revocation via Token Versioning (`tokenVersion` Pattern)
In stateless JWT architectures, standard tokens cannot be invalidated prior to their expiration date without heavy centralized blacklists. SmartCart solves this using the **`tokenVersion` pattern**:
1. Each user document stores an integer `tokenVersion: Number` (default `0`).
2. When issuing a JWT, the payload embeds the current version:  
   `jwt.sign({ userId: user._id, tokenVersion: user.tokenVersion }, SECRET, { expiresIn: "7d" })`.
3. During authentication middleware, the database compares:  
   `Number(payload.tokenVersion) === Number(user.tokenVersion)`.
4. **Revocation Trigger:** On user logout (`POST /api/auth/logout`), password reset, role alteration, or account suspension, the service executes:  
   `await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } })`.
5. **Result:** All previously distributed JWT tokens for that user become instantaneously invalid without maintaining a high-memory Redis token blacklist.

### 3.4 Backend-for-Frontend (BFF) Token Secrecy Protocol
Browser-side JavaScript (React/Next.js) is vulnerable to Cross-Site Scripting (XSS). In SmartCart, browser scripts never receive raw JWT tokens:
- The Next.js BFF server passes an internal shared secret header: `x-auth-exchange-secret` to the Auth Service via the API Gateway.
- Only when this secret matches does the Auth Service return the raw JWT to the BFF server.
- The BFF server encapsulates the JWT inside a secure, `HttpOnly`, `SameSite=Lax`, `Secure` session cookie.
- Client-side JavaScript cannot read, extract, or tamper with the session token.

---

## 4. Feature Deep-Dive: Super Admin Email 2FA Architecture

### 4.1 Threat Model & Security Justification
Super Administrators hold unrestricted system wildcard privileges (`*`), including financial refund authorizations and staff account creation. Standard single-factor passwords represent an unacceptable risk against credential stuffing, phishing, or leaked credentials. SmartCart enforces a multi-step 2FA challenge workflow.

### 4.2 Two-Factor Verification Protocol Flow
1. **Step 1 (Credential Validation):** Super Admin posts email and password to `POST /api/auth/super-admin-login`.
2. **Step 2 (Challenge Creation):** If credentials pass, the service generates a cryptographically secure 6-digit OTP code and a unique `challengeId` (UUID v4). A challenge record is created in MongoDB `superadminchallenges`:
   `{ challengeId, userId, codeHash: hashToken(code), tokenVersion, attempts: 0, expiresAt: Date.now() + 5*60*1000 }`.
3. **Step 3 (Zero-Knowledge Email Dispatch):** The plain OTP code is sent via the **Resend Email API** directly to the verified Super Admin email address.
   > **CRITICAL SECURITY MANDATE:** The OTP code is NEVER displayed on screen, NEVER returned in the API JSON response, and NEVER emitted into client-accessible logs. The HTTP response returns only: `{ success: true, challengeId: "...", message: "Verification code sent to your email." }`.
4. **Step 4 (Verification & Rate-Limiting):** The Super Admin submits the code to `POST /api/auth/super-admin-verify`.
   - Challenge TTL is strictly 5 minutes (`expiresAt < Date.now()` rejects with 401).
   - Brute-force protection: Maximum 5 attempts allowed. Failed submissions increment `attempts`. On the 5th failure, the challenge is destroyed.
   - Code validation uses SHA-256 hash comparison against the stored `codeHash`.
5. **Step 5 (Single-Use Destruction):** Upon successful code validation, the challenge document is deleted immediately, and the authenticated Super Admin session is established.

---

## 5. Module 2: Central API Gateway (`api-gateway`)

### 5.1 Reverse-Proxy Routing & Path Rewriting Engine
The Gateway runs on Port `4000`, serving as the sole public ingress. Downstream microservices run in an isolated internal Docker subnet (Ports 4001–4007) and cannot be reached directly from the Internet.
- **Prefix Route Matching:** Routes requests based on canonical resource paths: `/api/auth` $\rightarrow$ Auth Service, `/api/products` $\rightarrow$ Product Service, `/api/orders` $\rightarrow$ Order Service, etc.
- **Transparent Version Rewriting:** Clients calling versioned endpoints (e.g. `/v1/api/products`) have the `/v1` prefix stripped transparently before forwarding to upstream microservices.
- **Verb & Path Normalization:** Normalizes legacy routes, such as converting `PATCH /api/orders/:id/cancellation` into canonical upstream calls.

### 5.2 Sliding-Window Rate Limiting
Engineered using `express-rate-limit` with sliding window accounting:
- Configured via `RATE_LIMIT_WINDOW_MS=60000` (60 seconds) and `RATE_LIMIT_MAX=120` requests per client IP.
- When exceeded, emits HTTP **429 Too Many Requests** formatted as an RFC 7807 Problem Details object.
- Emits standard compliance headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After: 60`.

### 5.3 Boundary Request Validation via AJV JSON Schemas
To protect internal microservices from malformed payloads, SQL injection, and buffer overruns, the Gateway executes AJV checks at the edge *prior* to proxying:
- Evaluates payloads for `registration`, `login`, `productCreate`, `orderCreate`, and `cartItem`.
- Rejects invalid payloads immediately with HTTP **400 Bad Request** containing a structured `errors[]` array detailing the failing field, schema keyword, and human-readable message.

### 5.4 OpenAPI / Swagger Specification (OAS 3.0)
The Gateway maintains a comprehensive OpenAPI 3.0 specification:
- Interactive Swagger UI documentation is hosted at `/docs`.
- Machine-readable contract is accessible at `/openapi.json` for automated client SDK generation.
- Documents schemas, headers, authentication requirements, and RFC 7807 problem responses for all endpoints.

### 5.5 Circuit Breaker Pattern & Outbound Resilience (`resilience.js`)
To prevent cascading distributed system failures when a downstream microservice becomes unresponsive:
- If a service accumulates 5 consecutive faults within 15 seconds, the circuit breaker trips to **OPEN**.
- During OPEN state, subsequent calls fail fast immediately with **HTTP 503 Service Unavailable** and header `Retry-After: 15`, avoiding socket exhaustion.
- Safe idempotent requests (`GET`, `HEAD`) automatically execute up to 2 retries with exponential backoff before failing.

### 5.6 Uniform RFC 7807 / RFC 9457 Problem Details Standard
All non-2xx error responses across all services strictly adhere to the `application/problem+json` specification:
```json
{
    "type": "urn:smartcart:error:rate-limit-exceeded",
    "title": "Too Many Requests",
    "status": 429,
    "detail": "Rate limit exceeded. Try again in 42 seconds.",
    "instance": "urn:uuid:6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "invalidParams": []
}
```

---

## 6. Feature Deep-Dive: Durable MySQL Idempotency & GraphQL Facade

### 6.1 The Distributed Idempotency Problem in E-Commerce
Network retries, payment gateway timeouts, or user double-clicks on "Place Order" can cause catastrophic duplicate charges or double stock deductions. The API Gateway enforces **durable idempotency** for mutating requests (`POST /api/orders`, `POST /api/payments/create`, `POST /api/cart/items`).

### 6.2 Relational MySQL Storage Schema (`sql-store.js`)
```sql
CREATE TABLE IF NOT EXISTS api_idempotency (
    scope_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    idempotency_key VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    route_path VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    http_method VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    response_status SMALLINT NULL,
    response_body MEDIUMTEXT NULL,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (scope_hash, idempotency_key, route_path, http_method)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

### 6.3 Fingerprinting & State Machine Execution
1. **Client supplies header:** `Idempotency-Key: <UUID>`.
2. **Fingerprint Computation:** Gateway computes a SHA-256 hash of the normalized request body + method + path (`requestHash`) and user scope (`scopeHash`).
3. **State Transitions:**
   - `claimed`: Key is new. An uncompleted row (`completed=FALSE`) is inserted into MySQL. Gateway forwards request to microservice.
   - `in_progress`: Identical key arrives while the first request is still being processed. Gateway rejects with HTTP **409 Conflict** (*"Request with this idempotency key is still processing"*).
   - `replay`: Request with identical key and identical payload arrives after completion. Gateway intercepts request, **does not hit upstream**, and returns the cached HTTP status, headers, and body with header `Idempotency-Replayed: true`.
   - `conflict`: Same idempotency key reused with a *different* payload or path. Gateway rejects with HTTP **409 Conflict**.
4. **Automated Cleanup:** A background maintenance job purges records older than 7 days:  
   `DELETE FROM api_idempotency WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)`.

### 6.4 Unified GraphQL Facade (`/graphql`)
The Gateway provides a consolidated GraphQL endpoint powered by `express-graphql` to serve modern client data fetching:
- Exposes schema: `products(first: Int, after: String, search: String, category: String): ProductConnection!`.
- Implements opaque **cursor-based pagination** (`nextCursor`) for infinite-scroll mobile storefronts.
- Internally delegates query resolution to `product-service` with circuit breaker guards, returning clean data structures without exposing internal REST plumbing.

---

## 7. Top 15 Technical Interview Questions & High-Impact Answers

### Q1: Why did you choose the tokenVersion pattern for JWT revocation instead of a Redis blacklist?
> **Answer:** A Redis token blacklist requires writing every single active or invalidated token to an in-memory database with TTLs, introducing high memory overhead and an additional network dependency on every request. The `tokenVersion` approach embeds an integer in the JWT and user document. On logout or security events, we simply execute an atomic `$inc: { tokenVersion: 1 }` in MongoDB. Any token with an older version fails immediately. This provides instant global session revocation across all devices with zero cache synchronization overhead.

### Q2: How does your authentication service defend against side-channel timing attacks?
> **Answer:** In standard authentication, if an email doesn't exist, the backend returns immediately (e.g. <5ms). If the email exists, it runs bcrypt comparison (e.g. ~80ms). Attackers exploit this delta to enumerate valid emails. In our `auth-service`, we precompute a dummy bcrypt hash at server boot (`dummyPasswordHash`). If the user lookup returns null, we still execute `bcrypt.compare(password, dummyPasswordHash)`. This ensures the response latency is identical regardless of whether the email exists.

### Q3: Why is the Super Admin 2FA OTP sent via email rather than displayed on screen or returned in the API?
> **Answer:** True Two-Factor Authentication requires two distinct factors: *something you know* (password) and *something you have* (access to the verified email inbox). Returning the OTP in the API response or rendering it on screen completely defeats the second factor, as anyone possessing the password would immediately gain access. Dispatching the OTP out-of-band via Resend ensures that an attacker must compromise both the user's password and their email account.

### Q4: How does your API Gateway handle idempotency during high-concurrency race conditions?
> **Answer:** We rely on ACID compliance in MySQL InnoDB. The `api_idempotency` table has a composite primary key `(scope_hash, idempotency_key, route_path, http_method)`. When a request arrives, we execute an atomic `INSERT` with `completed=FALSE`. If two identical requests hit concurrently, one succeeds (state: `claimed`) while the second triggers an `ER_DUP_ENTRY` duplicate key exception. We inspect the uncompleted row and return HTTP 409 Conflict (`in_progress`), completely preventing concurrent duplicate order creation.

### Q5: Why did you use an API Gateway instead of an Enterprise Service Bus (ESB)?
> **Answer:** An ESB centralizes heavy business transformation logic, message routing, and orchestration inside a monolithic middleware bus, creating a major single point of failure and team coordination bottleneck. In modern cloud microservices, we follow the principle of *"smart endpoints, dumb pipes"*. Our API Gateway is a lightweight edge proxy responsible strictly for cross-cutting ingress concerns (routing, rate limiting, JWT verification, idempotency), while business logic resides entirely within autonomous microservices.

### Q6: What happens if a client submits an Idempotency-Key with a modified payload?
> **Answer:** We compute a SHA-256 fingerprint of the normalized request body, method, and path. If the key already exists in MySQL but the stored `request_hash` does not match the incoming hash, the Gateway detects payload tampering or key reuse across different actions and rejects the request with HTTP 409 Conflict.

### Q7: How does the Circuit Breaker prevent cascading failure across your microservices?
> **Answer:** If a downstream service (like `product-service`) crashes or suffers database locks, incoming requests would typically hang until socket timeout, exhausting gateway connections and memory. Our Circuit Breaker tracks consecutive upstream faults. Once 5 failures occur in 15 seconds, the circuit transitions to OPEN. For the next 15 seconds, calls fail immediately with HTTP 503 and `Retry-After: 15` without opening upstream sockets, giving the degraded service time to recover.

### Q8: How do you prevent Cross-Site Scripting (XSS) attacks on JWT session tokens?
> **Answer:** Browser JavaScript has zero access to the JWT token. The Next.js BFF server communicates with the API Gateway using an internal secret header (`X-Auth-Exchange-Secret`) to exchange credentials for the JWT. The BFF then places the token inside an `HttpOnly`, `SameSite=Lax`, `Secure` cookie. Because the cookie is HttpOnly, malicious JavaScript injected via XSS cannot access or steal the session token.

### Q9: Why do you perform request validation at the Gateway if services also validate?
> **Answer:** Defense-in-depth and fail-fast performance. Validating JSON schemas at the API Gateway via AJV rejects malformed, oversized, or malicious requests at the edge in less than 1ms. This protects downstream microservices from CPU spikes, saves network bandwidth, and prevents invalid payloads from triggering complex database queries.

### Q10: Why did you choose MySQL for Idempotency and MongoDB for Auth?
> **Answer:** Polyglot persistence based on data characteristics. Idempotency requires strict ACID transactions, row-level locking, and hard primary key uniqueness constraints on composite keys to avoid race conditions—areas where MySQL InnoDB excels. Auth requires flexible document modeling for nested addresses, variable role permission sets, and rapid user profile queries where MongoDB WiredTiger provides superior agility and query performance.

### Q11: What is RFC 7807 and why is it important in microservices?
> **Answer:** RFC 7807 defines a standardized JSON format (`application/problem+json`) for HTTP API errors. In a microservices architecture, without a standard, different services return inconsistent error shapes (e.g. `{ error: "..." }` vs `{ message: "...", code: 123 }`). RFC 7807 standardizes keys across all services: `type`, `title`, `status`, `detail`, and `instance` (correlation UUID), allowing frontend clients to parse errors uniformly.

### Q12: How does the Gateway implement distributed tracing across microservices?
> **Answer:** The Gateway checks for an existing `X-Request-Id` header or generates a new UUID v4. It injects this header into all proxied upstream calls and emits it in every structured JSON log entry. Downstream services propagate the `X-Request-Id` in their internal HTTP calls and logs, allowing engineers to trace a single user action across all 8 microservices.

### Q13: How does the GraphQL facade differ from the REST endpoints in your Gateway?
> **Answer:** REST endpoints map 1:1 to microservice resources. The GraphQL endpoint (`/graphql`) acts as an aggregation facade. For example, mobile clients can request only specific product fields (`name`, `price`, `rating`) rather than the complete 30-field REST JSON, solving the over-fetching problem and supporting opaque cursor pagination (`nextCursor`) for infinite scrolling.

### Q14: How are staff accounts invited and provisioned securely?
> **Answer:** Staff accounts cannot be registered via public signup. A Super Admin must issue an invitation via `POST /api/auth/invite-staff`. The service generates a random cryptographic token, stores its SHA-256 hash with a 24-hour expiration, and emails an onboarding link. The staff member clicks the link, submits a password, and the account is activated with the pre-assigned role.

### Q15: How does your rate limiter handle burst traffic without blocking legitimate users?
> **Answer:** We configure a sliding window of 60 seconds with a 120-request threshold per IP. This allows users to make rapid bursts (e.g., loading product assets or navigating multiple pages) while preventing sustained high-frequency brute-force attempts on sensitive endpoints like `/api/auth/login` and `/api/auth/super-admin-verify`.
