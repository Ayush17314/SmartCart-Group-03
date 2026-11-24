import os
import pymupdf

def build_pdf_report(output_pdf_path):
    html_content = """<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
@page {
    size: letter;
    margin: 0.65in;
}
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    font-size: 9.5pt;
    line-height: 1.45;
    color: #1e293b;
    margin: 0;
    padding: 0;
}
.header-box {
    background-color: #0f172a;
    color: #ffffff;
    padding: 20px 24px;
    border-radius: 6px;
    margin-bottom: 20px;
}
.header-box h1 {
    font-size: 20pt;
    margin: 0 0 6px 0;
    color: #ffffff;
    font-weight: 700;
    letter-spacing: -0.5px;
}
.header-box .subtitle {
    font-size: 11pt;
    color: #94a3b8;
    margin: 0 0 12px 0;
}
.header-box .meta-grid {
    display: flex;
    font-size: 8.5pt;
    color: #cbd5e1;
    border-top: 1px solid #334155;
    padding-top: 10px;
    margin-top: 10px;
}
.meta-item {
    margin-right: 24px;
}
.meta-item strong {
    color: #38bdf8;
}

h2 {
    font-size: 13pt;
    color: #0f172a;
    border-bottom: 1.5px solid #2563eb;
    padding-bottom: 4px;
    margin-top: 22px;
    margin-bottom: 8px;
    font-weight: 700;
}
h3 {
    font-size: 10.5pt;
    color: #1e3a8a;
    margin-top: 14px;
    margin-bottom: 6px;
    font-weight: 600;
}
p {
    margin: 5px 0 8px 0;
    text-align: justify;
}
ul, ol {
    margin: 4px 0 8px 18px;
    padding: 0;
}
li {
    margin-bottom: 4px;
}
strong {
    color: #0f172a;
}

table {
    width: 100%;
    border-collapse: collapse;
    margin: 10px 0 14px 0;
    font-size: 8.5pt;
}
th, td {
    border: 1px solid #cbd5e1;
    padding: 5px 8px;
    text-align: left;
    vertical-align: top;
}
th {
    background-color: #1e3a8a;
    color: #ffffff;
    font-weight: 600;
}
tr:nth-child(even) {
    background-color: #f8fafc;
}

.callout {
    background-color: #f0fdf4;
    border-left: 4px solid #16a34a;
    padding: 8px 12px;
    margin: 10px 0;
    font-size: 9pt;
    border-radius: 0 4px 4px 0;
}
.callout-blue {
    background-color: #eff6ff;
    border-left: 4px solid #2563eb;
    padding: 8px 12px;
    margin: 10px 0;
    font-size: 9pt;
    border-radius: 0 4px 4px 0;
}
.callout-warn {
    background-color: #fffbeb;
    border-left: 4px solid #d97706;
    padding: 8px 12px;
    margin: 10px 0;
    font-size: 9pt;
    border-radius: 0 4px 4px 0;
}

pre {
    background-color: #0f172a;
    color: #f8fafc;
    padding: 10px 12px;
    border-radius: 5px;
    font-family: "Courier New", Courier, monospace;
    font-size: 8pt;
    line-height: 1.35;
    margin: 8px 0 12px 0;
    white-space: pre-wrap;
    word-break: break-all;
}
code {
    font-family: "Courier New", Courier, monospace;
    font-size: 8.5pt;
    background-color: #f1f5f9;
    color: #0f172a;
    padding: 1px 4px;
    border-radius: 3px;
    border: 1px solid #e2e8f0;
}

.qa-card {
    background-color: #ffffff;
    border: 1px solid #cbd5e1;
    border-left: 4px solid #0f172a;
    padding: 10px 14px;
    margin-bottom: 12px;
    border-radius: 0 4px 4px 0;
}
.qa-q {
    font-weight: 700;
    color: #1e3a8a;
    font-size: 9.5pt;
    margin-bottom: 4px;
}
.qa-a {
    color: #334155;
    font-size: 9pt;
    margin: 0;
}
.badge {
    display: inline-block;
    padding: 1px 6px;
    font-size: 7.5pt;
    font-weight: 700;
    border-radius: 3px;
    background-color: #dbeafe;
    color: #1e40af;
}
.badge-green {
    background-color: #dcfce7;
    color: #15803d;
}
.badge-amber {
    background-color: #fef3c7;
    color: #b45309;
}
</style>
</head>
<body>

<div class="header-box">
    <h1>SMARTCART DISTRIBUTED E-COMMERCE PLATFORM</h1>
    <div class="subtitle">Technical Engineering & System Design Interview Preparation Report</div>
    <div class="meta-grid">
        <div class="meta-item"><strong>Candidate / Lead:</strong> Ayush Dubey (TeamID 03)</div>
        <div class="meta-item"><strong>Assigned Modules:</strong> auth-service (Port 4001) & api-gateway (Port 4000)</div>
        <div class="meta-item"><strong>Tech Stack:</strong> Node.js, Express, MongoDB, MySQL 8.4, JWT, AJV, GraphQL</div>
    </div>
</div>

<h2>1. Executive Summary & Candidate Elevator Pitch</h2>
<p>
<strong>How to pitch this in an interview:</strong><br>
<em>"In the SmartCart distributed e-commerce platform, I owned and engineered two critical infrastructural pillars: the <strong>API Gateway</strong> and the <strong>Authentication & Identity Service</strong>. The API Gateway acts as our unified reverse-proxy choke-point handling sliding-window rate limiting, schema boundary guards via AJV, OpenAPI/Swagger 3.0 documentation, and a durable MySQL-backed idempotency store to prevent duplicate orders or double billing. The Auth Service enforces a 5-tier Role-Based Access Control hierarchy, bcrypt password hashing with constant-time dummy comparisons, instant session revocation using token versioning, and an out-of-band email-based Two-Factor Authentication system for Super Administrators where OTP codes are dispatched via Resend and never exposed in browser or API payloads."</em>
</p>

<h2>2. Architectural Placement & Persistence Boundaries</h2>
<p>
SmartCart follows strict <strong>Database-per-Service isolation</strong>. The two assigned modules maintain separate, decoupled persistence layers to prevent data cross-contamination and horizontal scaling bottlenecks:
</p>
<table>
    <tr>
        <th>Subsystem Module</th>
        <th>Network Port</th>
        <th>Persistence Store</th>
        <th>Core Responsibilities</th>
    </tr>
    <tr>
        <td><strong>api-gateway</strong></td>
        <td><code>4000</code></td>
        <td><strong>MySQL 8.4 Server</strong><br>(InnoDB Engine: <code>smartcart</code>)</td>
        <td>Reverse proxying, path rewriting, sliding-window rate limiting (120 req/60s), durable idempotency (<code>api_idempotency</code>), request auditing (<code>api_audit</code>), Circuit Breaker resilience, unified GraphQL facade.</td>
    </tr>
    <tr>
        <td><strong>auth-service</strong></td>
        <td><code>4001</code></td>
        <td><strong>MongoDB Community 7.0</strong><br>(WiredTiger: <code>smartcart_auth</code>)</td>
        <td>User identity lifecycle, 5-role RBAC, bcrypt credential hashing (work factor 12), token versioning, Super Admin 2FA challenges, staff invitation lifecycles, and audit logging.</td>
    </tr>
</table>

<h2>3. Module 1: Authentication & Identity Service (auth-service)</h2>

<h3>3.1 Role-Based Access Control (RBAC) & Portal Access Isolation</h3>
<p>
The system implements five discrete operational personas mapped to an immutable hierarchy of 20 granular permissions. Furthermore, authentication requests are partitioned into role-specific portal endpoints (<code>portalAllowsRole</code>) to prevent privilege escalation:
</p>
<table>
    <tr>
        <th>Role Identifier</th>
        <th>Portal Gateway</th>
        <th>Granular Permissions & System Capabilities</th>
    </tr>
    <tr>
        <td><code>customer</code></td>
        <td><code>/api/auth/customer-login</code></td>
        <td>Storefront consumer. Permissions: <code>products.read</code>, <code>orders.read_own</code>, <code>refunds.request</code>.</td>
    </tr>
    <tr>
        <td><code>support</code></td>
        <td><code>/api/auth/staff-login</code></td>
        <td>Customer care staff. Read-only order/profile inspection, return evaluation: <code>orders.read_all</code>, <code>returns.review</code>.</td>
    </tr>
    <tr>
        <td><code>inventory_staff</code></td>
        <td><code>/api/auth/staff-login</code></td>
        <td>Warehouse personnel. Catalog item CRUD and stock count updates with mandatory audit notes: <code>products.write</code>, <code>inventory.write</code>.</td>
    </tr>
    <tr>
        <td><code>admin</code></td>
        <td><code>/api/auth/staff-login</code></td>
        <td>Store operations manager. Order dispatch lifecycle (CONFIRMED &rarr; SHIPPED &rarr; DELIVERED), promotions, reviews: 16 permissions.</td>
    </tr>
    <tr>
        <td><code>super_admin</code></td>
        <td><code>/api/auth/super-admin-login</code></td>
        <td>Platform governance owner. Wildcard (<code>*</code>) system privileges. Requires mandatory email 2FA verification.</td>
    </tr>
</table>

<h3>3.2 Cryptographic Password Hashing & Timing Attack Prevention</h3>
<p>
Credentials are hashed using <code>bcryptjs</code> with a high work factor of 12 salt rounds (<code>bcrypt.hash(password, 12)</code>). To eliminate side-channel <strong>timing attacks</strong> (where attackers deduce existing email addresses by measuring the execution time differences between instant failed lookups and intensive bcrypt comparisons), the service precomputes a dummy hash at server startup:
</p>
<pre>// Timing Attack Mitigation in auth-service
const dummyPasswordHash = bcrypt.hashSync("smartcart-invalid-login-dummy", 12);

// Even if user record is null, bcrypt.compare is still executed against dummy hash
const passwordMatches = await bcrypt.compare(
    String(req.body.password || ""),
    user?.password || dummyPasswordHash
);
if (!user || !passwordMatches) {
    return res.status(401).json({ success: false, message: "Invalid email or password." });
}</pre>

<h3>3.3 Instant Token Revocation via Token Versioning (tokenVersion Pattern)</h3>
<p>
In stateless JWT architectures, standard tokens cannot be invalidated prior to their expiration date without heavy centralized blacklists. SmartCart solves this using the <strong>tokenVersion pattern</strong>:
</p>
<ul>
    <li>Each user document stores an integer <code>tokenVersion: Number</code> (default <code>0</code>).</li>
    <li>When issuing a JWT, the payload embeds the current version: <code>jwt.sign({ userId: user._id, tokenVersion: user.tokenVersion }, SECRET, { expiresIn: "7d" })</code>.</li>
    <li>During authentication middleware, the database compares: <code>Number(payload.tokenVersion) === Number(user.tokenVersion)</code>.</li>
    <li><strong>Revocation Trigger:</strong> On user logout (<code>POST /api/auth/logout</code>), password reset, role alteration, or account suspension, the service executes:
        <br><code>await User.findByIdAndUpdate(userId, { $inc: { tokenVersion: 1 } })</code>.
    </li>
    <li><strong>Result:</strong> All previously distributed JWT tokens for that user become instantaneously invalid without maintaining a high-memory Redis token blacklist.</li>
</ul>

<h3>3.4 Backend-for-Frontend (BFF) Token Secrecy Protocol</h3>
<p>
Browser-side JavaScript (React/Next.js) is vulnerable to Cross-Site Scripting (XSS). In SmartCart, browser scripts never receive raw JWT tokens. Instead:
</p>
<ol>
    <li>The Next.js BFF server passes an internal shared secret header: <code>x-auth-exchange-secret</code> to the Auth Service via the API Gateway.</li>
    <li>Only when this secret matches does the Auth Service return the raw JWT to the BFF server.</li>
    <li>The BFF server encapsulates the JWT inside a secure, <code>HttpOnly</code>, <code>SameSite=Lax</code>, <code>Secure</code> session cookie.</li>
    <li>Client-side JavaScript cannot read, extract, or tamper with the session token.</li>
</ol>

<h2>4. Feature Deep-Dive: Super Admin Email 2FA Architecture</h2>

<h3>4.1 Threat Model & Security Justification</h3>
<p>
Super Administrators hold unrestricted system wildcard privileges (<code>*</code>), including financial refund authorizations and staff account creation. Standard single-factor passwords represent an unacceptable risk against credential stuffing, phishing, or leaked credentials. SmartCart enforces a multi-step 2FA challenge workflow.
</p>

<h3>4.2 Two-Factor Verification Protocol Flow</h3>
<ol>
    <li><strong>Step 1 (Credential Validation):</strong> Super Admin posts email and password to <code>POST /api/auth/super-admin-login</code>.</li>
    <li><strong>Step 2 (Challenge Creation):</strong> If credentials pass, the service generates a cryptographically secure 6-digit OTP code and a unique <code>challengeId</code> (UUID v4).
        <br>A record is created in MongoDB <code>superadminchallenges</code>:
        <br><code>{ challengeId, userId, codeHash: hashToken(code), tokenVersion, attempts: 0, expiresAt: Date.now() + 5*60*1000 }</code>.
    </li>
    <li><strong>Step 3 (Zero-Knowledge Email Dispatch):</strong> The plain OTP code is sent via the <strong>Resend Email API</strong> directly to the verified Super Admin email address.
        <div class="callout-warn">
            <strong>CRITICAL SECURITY MANDATE:</strong> The OTP code is NEVER displayed on screen, NEVER returned in the API JSON response, and NEVER emitted into client-accessible logs. The HTTP response returns only: <code>{ success: true, challengeId: "...", message: "Verification code sent to your email." }</code>.
        </div>
    </li>
    <li><strong>Step 4 (Verification & Rate-Limiting):</strong> The Super Admin submits the code to <code>POST /api/auth/super-admin-verify</code>.
        <ul>
            <li>Challenge TTL is strictly 5 minutes (<code>expiresAt &lt; Date.now()</code> rejects with 401).</li>
            <li>Brute-force protection: Maximum 5 attempts allowed. Failed submissions increment <code>attempts</code>. On the 5th failure, the challenge is destroyed.</li>
            <li>Code validation uses SHA-256 hash comparison against the stored <code>codeHash</code>.</li>
        </ul>
    </li>
    <li><strong>Step 5 (Single-Use Destruction):</strong> Upon successful code validation, the challenge document is deleted immediately, and the authenticated Super Admin session is established.</li>
</ol>

<h2>5. Module 2: Central API Gateway (api-gateway)</h2>

<h3>5.1 Reverse-Proxy Routing & Path Rewriting Engine</h3>
<p>
The Gateway runs on Port <code>4000</code>, serving as the sole public ingress. Downstream microservices run in an isolated internal Docker subnet (Ports 4001&ndash;4007) and cannot be reached directly from the Internet.
</p>
<ul>
    <li><strong>Prefix Route Matching:</strong> Routes requests based on canonical resource paths: <code>/api/auth</code> &rarr; Auth Service, <code>/api/products</code> &rarr; Product Service, <code>/api/orders</code> &rarr; Order Service, etc.</li>
    <li><strong>Transparent Version Rewriting:</strong> Clients calling versioned endpoints (e.g. <code>/v1/api/products</code>) have the <code>/v1</code> prefix stripped transparently before forwarding to upstream microservices.</li>
    <li><strong>Verb & Path Normalization:</strong> Normalizes legacy routes, such as converting <code>PATCH /api/orders/:id/cancellation</code> into canonical upstream calls.</li>
</ul>

<h3>5.2 Sliding-Window Rate Limiting</h3>
<p>
Engineered using <code>express-rate-limit</code> with sliding window accounting:
</p>
<ul>
    <li>Configured via <code>RATE_LIMIT_WINDOW_MS=60000</code> (60 seconds) and <code>RATE_LIMIT_MAX=120</code> requests per client IP.</li>
    <li>When exceeded, emits HTTP <strong>429 Too Many Requests</strong> formatted as an RFC 7807 Problem Details object.</li>
    <li>Emits standard compliance headers: <code>RateLimit-Limit</code>, <code>RateLimit-Remaining</code>, <code>RateLimit-Reset</code>, and <code>Retry-After: 60</code>.</li>
</ul>

<h3>5.3 Boundary Request Validation via AJV JSON Schemas</h3>
<p>
To protect internal microservices from malformed payloads, SQL injection, and buffer overruns, the Gateway executes AJV (Another JSON Schema Validator) checks at the edge <em>prior</em> to proxying:
</p>
<ul>
    <li>Evaluates payloads for <code>registration</code>, <code>login</code>, <code>productCreate</code>, <code>orderCreate</code>, and <code>cartItem</code>.</li>
    <li>Rejects invalid payloads immediately with HTTP <strong>400 Bad Request</strong> containing a structured <code>errors[]</code> array detailing the failing field, schema keyword, and human-readable message.</li>
</ul>

<h3>5.4 OpenAPI / Swagger Specification (OAS 3.0)</h3>
<p>
The Gateway maintains a comprehensive OpenAPI 3.0 specification:
</p>
<ul>
    <li>Interactive Swagger UI documentation is hosted at <code>/docs</code>.</li>
    <li>Machine-readable contract is accessible at <code>/openapi.json</code> for automated client SDK generation.</li>
    <li>Documents schemas, headers, authentication requirements, and RFC 7807 problem responses for all endpoints.</li>
</ul>

<h3>5.5 Circuit Breaker Pattern & Outbound Resilience (resilience.js)</h3>
<p>
To prevent cascading distributed system failures when a downstream microservice becomes unresponsive:
</p>
<pre>// Circuit Breaker Logic (resilience.js)
class CircuitBreaker {
    // Tracks failures per service. Threshold: 5 failures within 15 seconds.
    // States: CLOSED (Normal) -> OPEN (Failing fast) -> HALF-OPEN (Probing)
}</pre>
<ul>
    <li>If a service accumulates 5 consecutive faults within 15 seconds, the circuit breaker trips to <strong>OPEN</strong>.</li>
    <li>During OPEN state, subsequent calls fail fast immediately with <strong>HTTP 503 Service Unavailable</strong> and header <code>Retry-After: 15</code>, avoiding socket exhaustion.</li>
    <li>Safe idempotent requests (<code>GET</code>, <code>HEAD</code>) automatically execute up to 2 retries with exponential backoff before failing.</li>
</ul>

<h3>5.6 Uniform RFC 7807 / RFC 9457 Problem Details Standard</h3>
<p>
All non-2xx error responses across all services strictly adhere to the <code>application/problem+json</code> specification:
</p>
<pre>{
    "type": "urn:smartcart:error:rate-limit-exceeded",
    "title": "Too Many Requests",
    "status": 429,
    "detail": "Rate limit exceeded. Try again in 42 seconds.",
    "instance": "urn:uuid:6ba7b810-9dad-11d1-80b4-00c04fd430c8",
    "invalidParams": []
}</pre>

<h2>6. Feature Deep-Dive: Durable MySQL Idempotency & GraphQL Facade</h2>

<h3>6.1 The Distributed Idempotency Problem in E-Commerce</h3>
<p>
Network retries, payment gateway timeouts, or user double-clicks on "Place Order" can cause catastrophic duplicate charges or double stock deductions. The API Gateway enforces <strong>durable idempotency</strong> for mutating requests (<code>POST /api/orders</code>, <code>POST /api/payments/create</code>, <code>POST /api/cart/items</code>).
</p>

<h3>6.2 Relational MySQL Storage Schema (sql-store.js)</h3>
<pre>CREATE TABLE IF NOT EXISTS api_idempotency (
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
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;</pre>

<h3>6.3 Fingerprinting & State Machine Execution</h3>
<ol>
    <li><strong>Client supplies header:</strong> <code>Idempotency-Key: &lt;UUID&gt;</code>.</li>
    <li><strong>Fingerprint Computation:</strong> Gateway computes a SHA-256 hash of the normalized request body + method + path (<code>requestHash</code>) and user scope (<code>scopeHash</code>).</li>
    <li><strong>State Transitions:</strong>
        <ul>
            <li><code>claimed</code>: Key is new. An uncompleted row (<code>completed=FALSE</code>) is inserted into MySQL. Gateway forwards request to microservice.</li>
            <li><code>in_progress</code>: Identical key arrives while the first request is still being processed. Gateway rejects with HTTP <strong>409 Conflict</strong> (<em>"Request with this idempotency key is still processing"</em>).</li>
            <li><code>replay</code>: Request with identical key and identical payload arrives after completion. Gateway intercepts request, <strong>does not hit upstream</strong>, and returns the cached HTTP status, headers, and body with header <code>Idempotency-Replayed: true</code>.</li>
            <li><code>conflict</code>: Same idempotency key reused with a <em>different</em> payload or path. Gateway rejects with HTTP <strong>409 Conflict</strong>.</li>
        </ul>
    </li>
    <li><strong>Automated Cleanup:</strong> A background maintenance job purges records older than 7 days: <code>DELETE FROM api_idempotency WHERE created_at &lt; DATE_SUB(NOW(), INTERVAL 7 DAY)</code>.</li>
</ol>

<h3>6.4 Unified GraphQL Facade (/graphql)</h3>
<p>
The Gateway provides a consolidated GraphQL endpoint powered by <code>express-graphql</code> to serve modern client data fetching:
</p>
<ul>
    <li>Exposes schema: <code>products(first: Int, after: String, search: String, category: String): ProductConnection!</code>.</li>
    <li>Implements opaque <strong>cursor-based pagination</strong> (<code>nextCursor</code>) for infinite-scroll mobile storefronts.</li>
    <li>Internally delegates query resolution to <code>product-service</code> with circuit breaker guards, returning clean data structures without exposing internal REST plumbing.</li>
</ul>

<h2>7. Top 15 Technical Interview Questions & High-Impact Answers</h2>

<div class="qa-card">
    <div class="qa-q">Q1: Why did you choose the tokenVersion pattern for JWT revocation instead of a Redis blacklist?</div>
    <div class="qa-a">
        <strong>Answer:</strong> A Redis token blacklist requires writing every single active or invalidated token to an in-memory database with TTLs, introducing high memory overhead and an additional network dependency on every request. The <code>tokenVersion</code> approach embeds an integer in the JWT and user document. On logout or security events, we simply execute an atomic <code>$inc: { tokenVersion: 1 }</code> in MongoDB. Any token with an older version fails immediately. This provides instant global session revocation across all devices with zero cache synchronization overhead.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q2: How does your authentication service defend against side-channel timing attacks?</div>
    <div class="qa-a">
        <strong>Answer:</strong> In standard authentication, if an email doesn't exist, the backend returns immediately (e.g. &lt;5ms). If the email exists, it runs bcrypt comparison (e.g. ~80ms). Attackers exploit this delta to enumerate valid emails. In our <code>auth-service</code>, we precompute a dummy bcrypt hash at server boot (<code>dummyPasswordHash</code>). If the user lookup returns null, we still execute <code>bcrypt.compare(password, dummyPasswordHash)</code>. This ensures the response latency is identical regardless of whether the email exists.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q3: Why is the Super Admin 2FA OTP sent via email rather than displayed on screen or returned in the API?</div>
    <div class="qa-a">
        <strong>Answer:</strong> True Two-Factor Authentication requires two distinct factors: <em>something you know</em> (password) and <em>something you have</em> (access to the verified email inbox). Returning the OTP in the API response or rendering it on screen completely defeats the second factor, as anyone possessing the password would immediately gain access. Dispatching the OTP out-of-band via Resend ensures that an attacker must compromise both the user's password and their email account.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q4: How does your API Gateway handle idempotency during high-concurrency race conditions?</div>
    <div class="qa-a">
        <strong>Answer:</strong> We rely on ACID compliance in MySQL InnoDB. The <code>api_idempotency</code> table has a composite primary key <code>(scope_hash, idempotency_key, route_path, http_method)</code>. When a request arrives, we execute an atomic <code>INSERT</code> with <code>completed=FALSE</code>. If two identical requests hit concurrently, one succeeds (state: <code>claimed</code>) while the second triggers an <code>ER_DUP_ENTRY</code> duplicate key exception. We inspect the uncompleted row and return HTTP 409 Conflict (<code>in_progress</code>), completely preventing concurrent duplicate order creation.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q5: Why did you use an API Gateway instead of an Enterprise Service Bus (ESB)?</div>
    <div class="qa-a">
        <strong>Answer:</strong> An ESB centralizes heavy business transformation logic, message routing, and orchestration inside a monolithic middleware bus, creating a major single point of failure and team coordination bottleneck. In modern cloud microservices, we follow the principle of <em>"smart endpoints, dumb pipes"</em>. Our API Gateway is a lightweight edge proxy responsible strictly for cross-cutting ingress concerns (routing, rate limiting, JWT verification, idempotency), while business logic resides entirely within autonomous microservices.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q6: What happens if a client submits an Idempotency-Key with a modified payload?</div>
    <div class="qa-a">
        <strong>Answer:</strong> We compute a SHA-256 fingerprint of the normalized request body, method, and path. If the key already exists in MySQL but the stored <code>request_hash</code> does not match the incoming hash, the Gateway detects payload tampering or key reuse across different actions and rejects the request with HTTP 409 Conflict.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q7: How does the Circuit Breaker prevent cascading failure across your microservices?</div>
    <div class="qa-a">
        <strong>Answer:</strong> If a downstream service (like <code>product-service</code>) crashes or suffers database locks, incoming requests would typically hang until socket timeout, exhausting gateway connections and memory. Our Circuit Breaker tracks consecutive upstream faults. Once 5 failures occur in 15 seconds, the circuit transitions to OPEN. For the next 15 seconds, calls fail immediately with HTTP 503 and <code>Retry-After: 15</code> without opening upstream sockets, giving the degraded service time to recover.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q8: How do you prevent Cross-Site Scripting (XSS) attacks on JWT session tokens?</div>
    <div class="qa-a">
        <strong>Answer:</strong> Browser JavaScript has zero access to the JWT token. The Next.js BFF server communicates with the API Gateway using an internal secret header (<code>X-Auth-Exchange-Secret</code>) to exchange credentials for the JWT. The BFF then places the token inside an <code>HttpOnly</code>, <code>SameSite=Lax</code>, <code>Secure</code> cookie. Because the cookie is HttpOnly, malicious JavaScript injected via XSS cannot access or steal the session token.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q9: Why do you perform request validation at the Gateway if services also validate?</div>
    <div class="qa-a">
        <strong>Answer:</strong> Defense-in-depth and fail-fast performance. Validating JSON schemas at the API Gateway via AJV rejects malformed, oversized, or malicious requests at the edge in less than 1ms. This protects downstream microservices from CPU spikes, saves network bandwidth, and prevents invalid payloads from triggering complex database queries.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q10: Why did you choose MySQL for Idempotency and MongoDB for Auth?</div>
    <div class="qa-a">
        <strong>Answer:</strong> Polyglot persistence based on data characteristics. Idempotency requires strict ACID transactions, row-level locking, and hard primary key uniqueness constraints on composite keys to avoid race conditions—areas where MySQL InnoDB excels. Auth requires flexible document modeling for nested addresses, variable role permission sets, and rapid user profile queries where MongoDB WiredTiger provides superior agility and query performance.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q11: What is RFC 7807 and why is it important in microservices?</div>
    <div class="qa-a">
        <strong>Answer:</strong> RFC 7807 defines a standardized JSON format (<code>application/problem+json</code>) for HTTP API errors. In a microservices architecture, without a standard, different services return inconsistent error shapes (e.g. <code>{ error: "..." }</code> vs <code>{ message: "...", code: 123 }</code>). RFC 7807 standardizes keys across all services: <code>type</code>, <code>title</code>, <code>status</code>, <code>detail</code>, and <code>instance</code> (correlation UUID), allowing frontend clients to parse errors uniformly.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q12: How does the Gateway implement distributed tracing across microservices?</div>
    <div class="qa-a">
        <strong>Answer:</strong> The Gateway checks for an existing <code>X-Request-Id</code> header or generates a new UUID v4. It injects this header into all proxied upstream calls and emits it in every structured JSON log entry. Downstream services propagate the <code>X-Request-Id</code> in their internal HTTP calls and logs, allowing engineers to trace a single user action across all 8 microservices.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q13: How does the GraphQL facade differ from the REST endpoints in your Gateway?</div>
    <div class="qa-a">
        <strong>Answer:</strong> REST endpoints map 1:1 to microservice resources. The GraphQL endpoint (<code>/graphql</code>) acts as an aggregation facade. For example, mobile clients can request only specific product fields (<code>name</code>, <code>price</code>, <code>rating</code>) rather than the complete 30-field REST JSON, solving the over-fetching problem and supporting opaque cursor pagination (<code>nextCursor</code>) for infinite scrolling.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q14: How are staff accounts invited and provisioned securely?</div>
    <div class="qa-a">
        <strong>Answer:</strong> Staff accounts cannot be registered via public signup. A Super Admin must issue an invitation via <code>POST /api/auth/invite-staff</code>. The service generates a random cryptographic token, stores its SHA-256 hash with a 24-hour expiration, and emails an onboarding link. The staff member clicks the link, submits a password, and the account is activated with the pre-assigned role.
    </div>
</div>

<div class="qa-card">
    <div class="qa-q">Q15: How does your rate limiter handle burst traffic without blocking legitimate users?</div>
    <div class="qa-a">
        <strong>Answer:</strong> We configure a sliding window of 60 seconds with a 120-request threshold per IP. This allows users to make rapid bursts (e.g., loading product assets or navigating multiple pages) while preventing sustained high-frequency brute-force attempts on sensitive endpoints like <code>/api/auth/login</code> and <code>/api/auth/super-admin-verify</code>.
    </div>
</div>

</body>
</html>
"""

    writer = pymupdf.DocumentWriter(output_pdf_path)
    def rectfn(rect_num, filled):
        mediabox = pymupdf.Rect(0, 0, 612, 792) # Standard Letter size
        rect = pymupdf.Rect(45, 45, 567, 747)    # 0.65in margins
        return mediabox, rect, None

    story = pymupdf.Story(html=html_content)
    story.write(writer, rectfn)
    writer.close()

    # Stamp running headers and footers on generated PDF
    doc = pymupdf.open(output_pdf_path)
    total_pages = len(doc)
    for i, page in enumerate(doc):
        # Header (Skip page 1 top text since it has header-box)
        if i > 0:
            page.insert_text((45, 32), "SMARTCART ENGINEERING REPORT  |  AUTH-SERVICE & API-GATEWAY", fontsize=7.5, color=(0.4, 0.45, 0.5))
            page.draw_line((45, 36), (567, 36), color=(0.8, 0.85, 0.9), width=0.5)
        
        # Footer
        page.draw_line((45, 755), (567, 755), color=(0.8, 0.85, 0.9), width=0.5)
        page.insert_text((45, 767), "SmartCart Distributed Platform — Confidential Interview Preparation", fontsize=7.5, color=(0.4, 0.45, 0.5))
        page.insert_text((567 - 55, 767), f"Page {i+1} of {total_pages}", fontsize=7.5, color=(0.4, 0.45, 0.5))

    doc.save(output_pdf_path, incremental=True, encryption=pymupdf.PDF_ENCRYPT_KEEP)
    print(f"Successfully generated PDF report at: {output_pdf_path} (Total Pages: {total_pages})")

if __name__ == "__main__":
    out_pdf = os.path.join("docs", "SmartCart_Auth_and_APIGateway_Interview_Report.pdf")
    os.makedirs(os.path.dirname(out_pdf), exist_ok=True)
    build_pdf_report(out_pdf)
