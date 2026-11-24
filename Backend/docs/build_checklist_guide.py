from pathlib import Path
import textwrap


OUT = Path(__file__).resolve().parents[2] / "SmartCart-Backend-Checklist-Guide.pdf"
W, H = 612, 792
INK = (0.12, 0.18, 0.27)
MUTED = (0.34, 0.41, 0.50)
TEAL = (0.02, 0.48, 0.48)
PALE = (0.93, 0.97, 0.97)
GOLD = (0.80, 0.48, 0.10)


def esc(s):
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def text(x, y, value, size=10, color=INK, font="F1"):
    value = value.translate(str.maketrans({"’": "'", "‘": "'", "“": '"', "”": '"', "–": "-", "—": "-", "•": "|"}))
    r, g, b = color
    return f"{r:.3f} {g:.3f} {b:.3f} rg BT /{font} {size} Tf {x:.1f} {y:.1f} Td ({esc(value)}) Tj ET\n"


def rect(x, y, w, h, color):
    r, g, b = color
    return f"{r:.3f} {g:.3f} {b:.3f} rg {x} {y} {w} {h} re f\n"


class Page:
    def __init__(self, number, title, eyebrow="SMARTCART  /  BACKEND FIELD GUIDE"):
        self.parts = [rect(0, 0, W, H, (1, 1, 1)), rect(0, 0, 8, H, TEAL)]
        self.parts.append(text(42, 755, eyebrow, 8, TEAL, "F2"))
        self.parts.append(text(42, 720, title, 23, INK, "F2"))
        self.parts.append(rect(42, 704, 528, 1, (0.84, 0.89, 0.90)))
        self.y = 682
        self.number = number

    def para(self, value, size=10, color=INK, width=96, leading=14):
        for line in textwrap.wrap(value, width=width, break_long_words=False, break_on_hyphens=False):
            self.parts.append(text(46, self.y, line, size, color))
            self.y -= leading
        self.y -= 5

    def section(self, title, status="IMPLEMENTED"):
        self.parts.append(text(46, self.y, title, 13, INK, "F2"))
        sw = 94 if status == "PARTIAL" else (80 if status == "PENDING" else 88)
        color = GOLD if status != "IMPLEMENTED" else TEAL
        self.parts.append(rect(474, self.y - 4, sw, 17, color))
        self.parts.append(text(480, self.y + 1, status, 7, (1, 1, 1), "F2"))
        self.y -= 23

    def code(self, value):
        lines = value.strip("\n").splitlines()
        height = 12 * len(lines) + 16
        self.parts.append(rect(46, self.y - height + 5, 520, height, PALE))
        cy = self.y - 10
        for line in lines:
            # Snippets intentionally stay short and are set in a built-in PDF font.
            self.parts.append(text(56, cy, line[:93], 8, (0.10, 0.31, 0.34), "F3"))
            cy -= 12
        self.y -= height + 8

    def finish(self):
        self.parts.append(rect(42, 38, 528, 1, (0.84, 0.89, 0.90)))
        self.parts.append(text(42, 22, "SMARTCART  •  Implementation guide  •  October 2026", 8, MUTED))
        self.parts.append(text(550, 22, str(self.number), 8, MUTED))
        return "".join(self.parts).encode("latin-1", "replace")


pages = []
p = Page(1, "Backend checklist, explained")
p.parts.extend([rect(42, 560, 520, 112, INK), text(62, 635, "SMARTCART", 12, (0.42, 0.84, 0.79), "F2"), text(62, 596, "What is in place, how it works,", 21, (1, 1, 1), "F2"), text(62, 570, "and where it helps the project", 21, (1, 1, 1), "F2")])
p.y = 528
p.para("A practical tour of the backend checklist: what each item does, where SmartCart implements it, why it is useful, and a compact code example. The examples are excerpts; use the linked paths (relative to Backend/) to see the full implementation.", 11, width=88, leading=16)
p.section("Coverage at a glance")
p.para("Of the 26 requested checklist items: 20 are implemented, 5 are partial, and 1 is pending. Partial means the capability exists but has a stated scope or compatibility limitation. The internet deployment item remains pending because this workspace contains local Docker configuration, not a live hosted deployment.", 10, width=91)
p.section("How to read the labels")
p.para("IMPLEMENTED means the behavior exists in code and, where appropriate, is covered by the current gateway tests. PARTIAL means it exists with a meaningful limitation described here. PENDING means the checklist outcome is not present yet.", width=91)
p.section("Project map")
p.para("The API gateway is the public entry point for REST, GraphQL, validation, throttling, idempotency, and upstream resilience. Product, order, payment, and other services own their domain logic. MongoDB stores application documents; MySQL stores gateway idempotency and audit records. Docker Compose connects the local services.", width=91)
p.para("Status reflects the source in this workspace; it does not imply production hosting, live third-party credentials, or a production-scale distributed setup.", 9, MUTED, width=98)
pages.append(p)

p = Page(2, "HTTP API behavior")
p.section("HTTP methods, /v1, resource URLs", "PARTIAL")
p.para("The gateway exposes version-prefixed aliases such as /v1/api/products while retaining the existing /api routes for compatibility. The public URLs are mostly resource-shaped. One adapter maps a few public resource-style actions (for example, PATCH .../cancellation) to older internal service paths and methods, so method semantics are not uniformly owned by every service. See api-gateway/src/app.js.")
p.code('app.use((req, res, next) => {\n  req.apiPath = req.path.replace(/^\\/v1(?=\\/api\\/)/, "");\n  next();\n});')
p.section("Idempotency keys on POST")
p.para("For selected create operations (products, orders, cart items, payment creation, returns, and refunds), the gateway requires an Idempotency-Key. It remembers the first response, replays matching retries, rejects a reused key with a changed payload (409), and reports an in-progress duplicate (409). This helps clients retry after a dropped response without accidentally creating duplicates. It is not applied to every POST, such as login or webhooks.")
p.code('await pool.execute(\n  "INSERT INTO api_idempotency (...) VALUES (?,?,?,?)",\n  [scope, key, route, method]\n);')
p.section("AJV JSON Schema validation")
p.para("The gateway compiles JSON Schemas with AJV and checks selected request bodies before forwarding them. Invalid product, order, cart, payment, registration, or login input gets rejected early with a 400 response. This protects service code from malformed requests; domain rules still belong in the owning service. See api-gateway/src/schemas.js and app.js.")
p.code('const ajv = new Ajv({ allErrors: true });\nconst validate = ajv.compile(schemas.productCreate);\nif (!validate(req.body)) return next(badRequest(validate.errors));')
p.section("Eight or more status codes")
p.para("The API uses distinct outcomes including 200, 201, 400, 401, 403, 404, 409, 429, 500, 503, and 504. Status codes let clients distinguish validation, authentication, conflicts, throttling, and service failures. Gateway tests explicitly exercise common statuses; individual codes also depend on the request and service outcome.")
pages.append(p)

p = Page(3, "Representations, caching, and paging")
p.section("ETag and conditional 304")
p.para("Express generates entity tags for eligible responses, and the gateway forwards If-None-Match upstream and preserves ETag on the way back. A matching conditional GET can return 304 Not Modified, allowing clients to reuse their cached copy. The gateway Supertest suite checks this path. See api-gateway/src/app.js and tests/api.test.js.")
p.code('headers: { "if-none-match": req.get("If-None-Match") || "" }\n// After the upstream response: preserve ETag; end on 304.')
p.section("JSON and XML negotiation", "PARTIAL")
p.para("Product list, category, and detail GET routes inspect Accept and return JSON or XML; Vary: Accept keeps caches from mixing the representations. Other service resources are not all XML-enabled, so this is a product API capability rather than universal negotiation. See product-service/src/server.js.")
p.code('res.vary("Accept");\nif (req.accepts(["json", "xml"]) === "xml") {\n  return res.type("application/xml").send(asXml(body));\n}')
p.section("Cursor pagination with a next link")
p.para("Product and order lists encode the last row’s creation time and ID into a cursor. The next request uses after=<cursor>; the response includes pagination.nextCursor, links.next, and a Link header. This supports stable sequential browsing without large page offsets. Product cursor mode uses the default newest-first ordering; offset pagination remains available. See product-service/src/server.js and order-service/src/server.js.")
p.code('if (next) res.set("Link", `<${next}>; rel="next"`);\nreturn res.json({ data: items, links: { next },\n  pagination: { nextCursor } });')
p.section("Cache-Control on GET")
p.para("The gateway sets private, no-cache by default for GET and HEAD; health endpoints use no-store. The product service sets public, max-age=30, must-revalidate for its GET/HEAD responses. Explicit policy avoids accidental long-lived caching of account data while allowing short-lived caching of catalog data. Check each route’s final headers when adding a new service.")
p.code('if (req.method === "GET" || req.method === "HEAD")\n  res.set("Cache-Control", "public, max-age=30, must-revalidate");')
pages.append(p)

p = Page(4, "Errors, traffic, and API discovery")
p.section("One consistent error body", "PARTIAL")
p.para("Gateway-generated errors use { success: false, message, requestId }, and upstream non-success responses are normalized to that shape at the gateway. Several services still format their own errors differently when accessed directly, and not every route is guaranteed to pass through the gateway. Treat the gateway as the consistent public boundary; service-wide unification remains follow-up work. See api-gateway/src/app.js.")
p.code('res.status(status).json({ success: false,\n  message: status >= 500 ? "Internal server error" : error.message,\n  requestId: req.requestId });')
p.section("Rate-limit headers and 429")
p.para("express-rate-limit applies a configurable per-process request limit to API routes and emits standard rate-limit headers. Once a client exceeds the window, it receives 429. This gives clients a signal to slow down. Because counters live in each process, multiple gateway replicas do not yet share one global quota. See api-gateway/src/app.js.")
p.code('rateLimit({ windowMs: 60_000, limit: 120,\n  standardHeaders: true, legacyHeaders: false,\n  handler: (req, res) => res.status(429).json(errorBody) });')
p.section("Hand-written OpenAPI and Swagger UI")
p.para("The API description is maintained as source code in api-gateway/src/openapi.js rather than generated from routes. The gateway serves it at /openapi.json and hosts Swagger UI at /docs. This makes the contract inspectable and provides an interactive way for developers to explore documented endpoints.")
p.code('const swaggerDocument = require("./openapi");\napp.get("/openapi.json", ...);\napp.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument));')
p.section("GraphQL alongside REST")
p.para("The gateway also exposes /graphql with a products query supporting first, after, search, and category. Its resolver calls the product service and returns a connection-like list and next cursor. GraphQL is an additional product-reading interface; the broader domain is still primarily REST. See api-gateway/src/app.js.")
p.code('type Query { products(first: Int = 20, after: String,\n  search: String, category: String): ProductConnection! }')
pages.append(p)

p = Page(5, "Data and outbound service calls")
p.section("SQL with parameterized queries + MongoDB")
p.para("MySQL is used by the gateway for idempotency and request audit data, with mysql2 parameter placeholders and values passed separately. This keeps user-controlled values out of SQL syntax. MongoDB remains the document store for domain services such as products, orders, payments, and auth. The two databases serve different data shapes. See api-gateway/src/sql-store.js and service model files.")
p.code('await pool.execute(\n  "SELECT ... WHERE scope_hash=? AND idempotency_key=?",\n  [scopeHash, idempotencyKey]\n);')
p.section("Timeout on outbound calls")
p.para("Gateway fetch calls use AbortSignal.timeout with an environment-configured limit. Order and payment service Axios calls also set explicit timeouts. A stalled dependency therefore cannot hold a request open indefinitely; timeout failures are surfaced as gateway errors (typically 504). See api-gateway/src/app.js, order-service/src/server.js, and payment-service/src/services/payment.service.js.")
p.code('signal: AbortSignal.timeout(\n  Number(process.env.OUTBOUND_TIMEOUT_MS) || 5000\n)')
p.section("Retry with increasing backoff")
p.para("retryWithBackoff applies increasing delays between retry attempts, with configurable retry count and base delay. The gateway limits automatic retries to GET and HEAD for REST proxy traffic, because repeating a write could create duplicate effects. GraphQL product reads can also retry. See api-gateway/src/resilience.js.")
p.code('await retryWithBackoff(call, { retries: 2, baseDelayMs: 200 });\n// Delay grows between attempts; writes are not auto-retried.')
p.section("Circuit breaker")
p.para("The gateway tracks transient failures per upstream service. After the configured failure threshold, calls fail quickly while the breaker is open; after a reset interval it permits a probe. This reduces repeated waits against a dependency that is already failing. It is in-memory per gateway process, not a shared distributed breaker. See api-gateway/src/resilience.js.")
p.code('if (state.failures >= this.failureThreshold)\n  state.openedAt = Date.now();')
pages.append(p)

p = Page(6, "Security, middleware, and operations")
p.section("Deliberate CORS configuration")
p.para("Gateway and service CORS origins come from CORS_ORIGIN, parsed as a comma-separated allowlist, with credentials enabled. This lets the browser frontend make authenticated cross-origin requests while avoiding a wildcard origin. Set the variable to the actual frontend origin(s) in each environment. See api-gateway/src/app.js and service app/server files.")
p.code('cors({ origin: (process.env.CORS_ORIGIN || defaultOrigin)\n  .split(",").map(value => value.trim()), credentials: true })')
p.section("Express middleware and central errors")
p.para("Express middleware handles security headers, CORS, request IDs, body parsing, cache policy, throttling, validation, and routing. The gateway’s final error middleware logs failures and emits the public error envelope. Services retain their own domain-level error handling, with the gateway normalizing proxied failures.")
p.code('app.use(express.json({ limit: "200kb" }));\napp.use((error, req, res, next) => {\n  res.status(status).json({ success: false, message, requestId });\n});')
p.section("Structured logs and correlation ID")
p.para("Each gateway request receives an X-Request-Id (or keeps the caller’s supplied ID). That ID is returned in the response, included in JSON log records, forwarded to services, and written to the SQL audit table. It helps connect events belonging to one request across the service boundary. See api-gateway/src/app.js and sql-store.js.")
p.code('console.log(JSON.stringify({ level: "info", service,\n  requestId: req.requestId, method: req.method,\n  status: res.statusCode, durationMs }));')
pages.append(p)

p = Page(7, "Identity and runtime configuration")
p.section("JWT authentication and authorization")
p.para("Protected routes require a Bearer JWT. Services verify it using JWT_SECRET, and administrative actions check the role claim (for example, product writes require admin). The gateway checks that protected requests include an Authorization header; signature and role verification remain in the owning service. Keep JWT_SECRET private and consistent wherever tokens must be verified. See product-service/src/server.js and order-service/src/server.js.")
p.code('req.user = jwt.verify(token, process.env.JWT_SECRET);\nif (req.user.role !== "admin") return res.sendStatus(403);')
p.section("Docker and twelve-factor configuration")
p.para("Dockerfiles package services, and docker-compose.yml connects the gateway, domain services, MySQL, and MongoDB for local development. Ports, credentials, origins, timeouts, and service URLs are configured through environment variables (with examples in Backend/.env.example). This makes the app portable across environments. Use production secrets in the deployment platform, not committed defaults.")
p.code('PRODUCT_SERVICE_URL: http://product-service:4002\nSQL_DATABASE: ${SQL_DATABASE:-smartcart}\nMONGO_URI: mongodb://mongodb:27017/smartcart')
p.section("Configuration to confirm per environment")
p.para("Set CORS_ORIGIN to the frontend origin, configure database URLs and credentials, JWT_SECRET, upstream service URLs, and timeout/rate-limit values before running outside local Docker. The environment sample documents names and safe local defaults; rotate secrets and provide real values in the deployment environment.")
pages.append(p)

p = Page(8, "Verification and remaining work")
p.section("Automated Jest and Supertest tests")
p.para("The API gateway suite uses Jest and Supertest to exercise HTTP behavior without requiring a live external service for every case. Current coverage includes AJV rejection, versioned routes and ETags, conditional 304, idempotent replay/conflict, OpenAPI/Swagger availability, rate-limit headers, and circuit behavior. The most recent recorded run passed 6 tests. This is useful regression coverage, not proof of every deployment configuration or every downstream service integration. See api-gateway/tests/api.test.js.")
p.code('await request(app).get("/v1/api/products")\n  .set("If-None-Match", etag).expect(304);')
p.section("Pending: live internet deployment", "PENDING")
p.para("A deployment that is publicly reachable is not present in this workspace. Docker Compose prepares a local multi-service stack, but a real deployment still needs a hosting target, production environment variables and secrets, database hosting, and a deployed URL. After deployment, verify the health endpoint and key routes over HTTPS.")
p.section("Scope and practical caveats")
p.para("This guide covers the checklist in the request. The implementation is strongest at the gateway boundary; some policies (rate limits and circuit state) are process-local, XML is limited to product reads, and error normalization is most reliable for requests that pass through the gateway. A production rollout should validate secret management, shared rate-limit/idempotency behavior, database readiness, and deployed service URLs.")
p.section("Where to start reading")
p.para("Backend/api-gateway/src/app.js — gateway pipeline and public behavior. Backend/api-gateway/src/resilience.js — retries and breaker. Backend/api-gateway/src/sql-store.js — SQL persistence. Backend/product-service/src/server.js — catalog negotiation and cursors. Backend/order-service/src/server.js and Backend/payment-service/src/services/payment.service.js — domain calls and payment integration. Backend/api-gateway/tests/api.test.js — gateway verification.", 9, width=100)
pages.append(p)


def make_pdf(content_pages):
    objects = [None, b"<< /Type /Catalog /Pages 2 0 R >>", None,
               b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
               b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
               b"<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>"]
    kids = []
    for stream in content_pages:
        # The current list length is the next one-based object number because
        # slot zero is the unused PDF object number zero.
        page_id = len(objects)
        stream_id = page_id + 1
        kids.append(f"{page_id} 0 R")
        objects.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {W} {H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents {stream_id} 0 R >>".encode())
        objects.append(b"<< /Length " + str(len(stream)).encode() + b" >>\nstream\n" + stream + b"endstream")
    objects[2] = f"<< /Type /Pages /Kids [{' '.join(kids)}] /Count {len(kids)} >>".encode()
    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for i, obj in enumerate(objects[1:], 1):
        offsets.append(len(output))
        output.extend(f"{i} 0 obj\n".encode() + obj + b"\nendobj\n")
    xref = len(output)
    output.extend(f"xref\n0 {len(objects)}\n0000000000 65535 f \n".encode())
    for off in offsets[1:]:
        output.extend(f"{off:010d} 00000 n \n".encode())
    output.extend(f"trailer\n<< /Size {len(objects)} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode())
    return output


OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_bytes(make_pdf([page.finish() for page in pages]))
print(f"Created {OUT} ({len(pages)} pages, {OUT.stat().st_size:,} bytes)")
