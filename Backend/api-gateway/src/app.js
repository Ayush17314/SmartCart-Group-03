const crypto = require("crypto");
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { createProxyMiddleware } = require("http-proxy-middleware");
const { graphqlHTTP } = require("express-graphql");
const { buildSchema } = require("graphql");
const swaggerUi = require("swagger-ui-express");
const swaggerDocument = require("./openapi");
const { validateBody } = require("./schemas");
const { CircuitBreaker, retryWithBackoff } = require("./resilience");
const sqlStore = require("./sql-store");

const app = express();
const breakers = new CircuitBreaker({
    failureThreshold: Number(process.env.CIRCUIT_FAILURE_THRESHOLD) || 5,
    resetTimeoutMs: Number(process.env.CIRCUIT_RESET_TIMEOUT_MS) || 15_000,
});
const serviceConfigs = [
    { key: "auth", path: "/api/auth", env: "AUTH_SERVICE_URL", fallback: "http://localhost:4001" },
    { key: "products", path: "/api/products", env: "PRODUCT_SERVICE_URL", fallback: "http://localhost:4002" },
    { key: "reviews", path: "/api/reviews", env: "PRODUCT_SERVICE_URL", fallback: "http://localhost:4002" },
    { key: "settings", path: "/api/settings", env: "PRODUCT_SERVICE_URL", fallback: "http://localhost:4002" },
    { key: "cart", path: "/api/cart", env: "CART_SERVICE_URL", fallback: "http://localhost:4003" },
    { key: "wishlist", path: "/api/wishlist", env: "WISHLIST_SERVICE_URL", fallback: "http://localhost:4004" },
    { key: "orders", path: "/api/orders", env: "ORDER_SERVICE_URL", fallback: "http://localhost:4005" },
    { key: "promotions", path: "/api/promotions", env: "ORDER_SERVICE_URL", fallback: "http://localhost:4005" },
    { key: "payments", path: "/api/payments", env: "PAYMENT_SERVICE_URL", fallback: "http://localhost:4006" },
    { key: "notifications", path: "/api/notifications", env: "NOTIFICATION_SERVICE_URL", fallback: "http://localhost:4007" },
];
const routesWithBodySchema = [
    { method: "post", path: "/api/auth/register", schema: "registration" },
    { method: "post", path: "/api/auth/login", schema: "login" },
    { method: "post", path: "/api/auth/customer-login", schema: "login" },
    { method: "post", path: "/api/auth/staff-login", schema: "login" },
    { method: "post", path: "/api/auth/super-admin-login", schema: "login" },
    { method: "post", path: "/api/auth/super-admin-verify", schema: "superAdminCode" },
    { method: "post", path: "/api/auth/verify-email", schema: "emailToken" },
    { method: "post", path: "/api/products", schema: "productCreate" },
    { method: "put", path: /^\/api\/products\/[^/]+$/, schema: "productCreate" },
    { method: "post", path: "/api/orders", schema: "orderCreate" },
    { method: "post", path: "/api/cart/items", schema: "cartItem" },
    { method: "post", path: "/api/payments/create", schema: "paymentCreate" },
];
const idempotentPostPaths = new Set(["/api/products", "/api/orders", "/api/cart/items", "/api/payments/create"]);
const protectedRoutePrefixes = ["/api/cart", "/api/wishlist", "/api/orders", "/api/promotions", "/api/reviews", "/api/payments", "/api/notifications"];
const graphqlSchema = buildSchema(`
    type Product { _id: ID!, name: String!, description: String, price: Float!, category: String!, brand: String, stock: Int }
    type ProductConnection { items: [Product!]!, nextCursor: String, next: String }
    type Query { products(first: Int = 20, after: String, search: String, category: String): ProductConnection! }
`);

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:3000,http://localhost:3001").split(",").map((value) => value.trim()),
    credentials: true,
}));
app.use((req, res, next) => {
    req.requestId = req.get("X-Request-Id") || crypto.randomUUID();
    res.set("X-Request-Id", req.requestId);
    req.startedAt = Date.now();
    res.on("finish", () => {
        console.log(JSON.stringify({ level: "info", service: "api-gateway", requestId: req.requestId, method: req.method, path: req.originalUrl, status: res.statusCode, durationMs: Date.now() - req.startedAt }));
        sqlStore.writeAudit({ requestId: req.requestId, method: req.method, routePath: req.originalUrl, status: res.statusCode }).catch((error) => {
            console.error(JSON.stringify({ level: "error", service: "api-gateway", requestId: req.requestId, message: "audit write failed", error: error.message }));
        });
    });
    next();
});
app.use(express.json({ limit: "200kb", verify: (req, res, buffer) => { req.rawBody = buffer; } }));
app.use((req, res, next) => {
    req.apiPath = req.path.replace(/^\/v1(?=\/api\/)/, "");
    req.apiOriginalUrl = req.originalUrl.replace(/^\/v1(?=\/api\/)/, "");
    res.set("Cache-Control", req.method === "GET" || req.method === "HEAD" ? "private, no-cache" : "no-store");
    next();
});
const apiRateLimit = rateLimit({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 60_000,
    limit: Number(process.env.RATE_LIMIT_MAX) || 120,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ success: false, message: "Too many requests", requestId: req.requestId }),
});
app.use((req, res, next) => req.apiPath && req.apiPath.startsWith("/api") ? apiRateLimit(req, res, next) : next());

function expectedIdempotencyKey(req) {
    const key = req.get("Idempotency-Key");
    if (!key || key.length > 200 || !/^[\x21-\x7E]+$/.test(key)) {
        const error = new Error("A valid Idempotency-Key header is required for POST requests");
        error.status = 400;
        throw error;
    }
    return key;
}

function identityHash(req) {
    const token = (req.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const identity = token || req.ip || "anonymous";
    return crypto.createHash("sha256").update(identity).digest("hex");
}

function fingerprint(req) {
    return crypto.createHash("sha256").update(JSON.stringify({ body: req.body, query: req.query })).digest("hex");
}

function authExchangeAuthorized(req) {
    const expected = process.env.AUTH_EXCHANGE_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-auth-exchange-secret-change-me");
    const received = req.get("X-Auth-Exchange-Secret") || "";
    const expectedBuffer = Buffer.from(expected);
    const receivedBuffer = Buffer.from(received);
    return expectedBuffer.length >= 32 && receivedBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(receivedBuffer, expectedBuffer);
}

async function fetchUpstream(url, options) {
    const response = await fetch(url, options);
    if (response.status >= 500) {
        const error = new Error("Upstream service returned a server error");
        error.response = { status: response.status };
        error.status = 503;
        throw error;
    }
    return response;
}

function idempotencyMiddleware(req, res, next) {
    let idempotencyKey;
    try { idempotencyKey = expectedIdempotencyKey(req); }
    catch (error) { return next(error); }
    const entry = {
        scopeHash: identityHash(req), idempotencyKey,
        routePath: req.path, method: req.method, requestHash: fingerprint(req),
    };
    sqlStore.claimIdempotency(entry).then((claim) => {
        if (claim.state === "conflict") return res.status(409).json({ success: false, message: "Idempotency key was already used with a different request", requestId: req.requestId });
        if (claim.state === "in_progress") return res.status(409).json({ success: false, message: "Request with this idempotency key is still processing", requestId: req.requestId });
        if (claim.state === "replay") {
            res.set("Idempotency-Replayed", "true");
            return res.status(claim.status).json(claim.body);
        }
        let body = "";
        const originalWrite = res.write.bind(res);
        const originalEnd = res.end.bind(res);
        res.write = (chunk, ...args) => {
            if (chunk) body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
            return originalWrite(chunk, ...args);
        };
        res.end = (chunk, ...args) => {
            if (chunk) body += Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk);
            const result = originalEnd(chunk, ...args);
            try {
                const parsed = JSON.parse(body);
                if (res.statusCode < 500) sqlStore.completeIdempotency({ ...entry, status: res.statusCode, body: parsed }).catch((error) => {
                    console.error(JSON.stringify({ level: "error", requestId: req.requestId, message: "idempotency response persistence failed", error: error.message }));
                });
                else sqlStore.releaseIdempotency(entry).catch(() => undefined);
            } catch {
                sqlStore.releaseIdempotency(entry).catch(() => undefined);
            }
            return result;
        };
        next();
    }).catch(next);
}

async function proxyRequest(config, req, res, next) {
    const target = process.env[config.env] || config.fallback;
    let upstreamPath = req.apiOriginalUrl || req.originalUrl;
    let upstreamMethod = req.method;
    const orderCancellation = upstreamPath.match(/^\/api\/orders\/([^/?]+)\/cancellation(?:\?|$)/);
    const orderReturn = upstreamPath.match(/^\/api\/orders\/([^/?]+)\/returns(?:\?|$)/);
    const paymentRefund = upstreamPath.match(/^\/api\/payments\/([^/?]+)\/refunds(?:\?|$)/);
    if (orderCancellation && req.method === "PATCH") {
        upstreamPath = upstreamPath.replace(/\/cancellation(?=\?|$)/, "/cancel");
        upstreamMethod = "POST";
    } else if (orderReturn && req.method === "POST") {
        upstreamPath = upstreamPath.replace(/\/returns(?=\?|$)/, "/return");
    } else if (paymentRefund && req.method === "POST") {
        upstreamPath = upstreamPath.replace(/^\/api\/payments\/([^/?]+)\/refunds/, "/api/payments/refund/$1");
    }
    try {
        const response = await breakers.execute(config.key, () => retryWithBackoff(() => fetchUpstream(`${target}${upstreamPath}`, {
            method: upstreamMethod,
            headers: {
                accept: req.get("Accept") || "application/json",
                "content-type": req.get("Content-Type") || "application/json",
                authorization: req.get("Authorization") || "",
                ...(["/api/auth/login", "/api/auth/customer-login", "/api/auth/staff-login", "/api/auth/super-admin-login", "/api/auth/super-admin-verify", "/api/auth/google-login"].includes(req.apiPath) && authExchangeAuthorized(req) ? { "x-auth-exchange-secret": process.env.AUTH_EXCHANGE_SECRET || "local-auth-exchange-secret-change-me" } : {}),
                "idempotency-key": req.get("Idempotency-Key") || "",
                "x-request-id": req.requestId,
                "if-none-match": req.get("If-None-Match") || "",
                "if-modified-since": req.get("If-Modified-Since") || "",
            },
            ...(upstreamMethod === "GET" || upstreamMethod === "HEAD" ? {} : { body: req.rawBody && req.apiPath === "/api/payments/webhook" ? req.rawBody : JSON.stringify(req.body) }),
            signal: AbortSignal.timeout(Number(process.env.OUTBOUND_TIMEOUT_MS) || 5000),
        }), {
            retries: (req.method === "GET" || req.method === "HEAD" ? Number(process.env.OUTBOUND_RETRIES) || 2 : 0),
            baseDelayMs: Number(process.env.OUTBOUND_RETRY_BASE_MS) || 200,
        }));
        res.status(response.status);
        response.headers.forEach((value, key) => {
            if (["content-type", "etag", "last-modified", "cache-control", "link", "vary", "retry-after", "x-ratelimit-limit", "x-ratelimit-remaining", "x-ratelimit-reset"].includes(key.toLowerCase())) res.set(key, value);
        });
        if (req.method === "HEAD" || response.status === 304) return res.end();
        const contentType = response.headers.get("content-type") || "application/json";
        const payload = await response.text();
        if (!response.ok) {
            let upstreamError;
            try { upstreamError = JSON.parse(payload); } catch { upstreamError = null; }
            return res.status(response.status).json({ success: false, message: upstreamError?.message || "Request failed", requestId: req.requestId });
        }
        if (contentType.includes("application/xml") || contentType.includes("text/xml")) return res.type("application/xml").send(payload);
        if (contentType.includes("application/json")) {
            if (["/api/auth/login", "/api/auth/customer-login", "/api/auth/staff-login", "/api/auth/super-admin-login", "/api/auth/super-admin-verify", "/api/auth/google-login"].includes(req.apiPath)) {
                let loginBody;
                try { loginBody = JSON.parse(payload); } catch { loginBody = null; }
                if (loginBody?.data?.token && !authExchangeAuthorized(req)) delete loginBody.data.token;
                if (loginBody) return res.type("application/json").send(JSON.stringify(loginBody));
            }
            return res.type("application/json").send(payload);
        }
        return res.type(contentType).send(payload);
    } catch (error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") error.status = 504;
        if (error.code === "CIRCUIT_OPEN") res.set("Retry-After", String(Math.ceil((Number(process.env.CIRCUIT_RESET_TIMEOUT_MS) || 15_000) / 1000)));
        return next(error);
    }
}

app.get("/health", (req, res) => res.set("Cache-Control", "no-store").json({ success: true, data: { service: "api-gateway" }, requestId: req.requestId }));
app.get("/openapi.json", (req, res) => res.set("Cache-Control", "no-cache").json(swaggerDocument));
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerDocument, { explorer: true }));

app.use("/graphql", graphqlHTTP({
    schema: graphqlSchema,
    graphiql: process.env.NODE_ENV !== "production",
    rootValue: {
        products: async ({ first, after, search, category }, context) => {
            const query = new URLSearchParams({ limit: String(first || 20) });
            if (after) query.set("after", after);
            if (search) query.set("search", search);
            if (category) query.set("category", category);
            const response = await breakers.execute("products", () => retryWithBackoff(() => fetchUpstream(`${process.env.PRODUCT_SERVICE_URL || "http://localhost:4002"}/api/products?${query}`, { signal: AbortSignal.timeout(Number(process.env.OUTBOUND_TIMEOUT_MS) || 5000) }), { retries: Number(process.env.OUTBOUND_RETRIES) || 2, baseDelayMs: Number(process.env.OUTBOUND_RETRY_BASE_MS) || 200 }));
            if (!response.ok) throw new Error("Product service is unavailable");
            const body = await response.json();
            const data = body.data || body;
            return { items: data.items || [], nextCursor: data.pagination?.nextCursor || null, next: data.links?.next || null };
        },
    },
    context: (req) => ({ authorization: req.headers.authorization }),
}));

app.use((req, res, next) => {
    const service = serviceConfigs.find((candidate) => req.apiPath === candidate.path || req.apiPath.startsWith(`${candidate.path}/`));
    if (!service) return next();
    const route = routesWithBodySchema.find((candidate) => candidate.method === req.method.toLowerCase() && (candidate.path instanceof RegExp ? candidate.path.test(req.apiPath) : candidate.path === req.apiPath));
    if (route) {
        return validateBody(route.schema)(req, res, next);
    }
    return next();
});

app.use((req, res, next) => {
    if (req.method !== "POST" || !(idempotentPostPaths.has(req.apiPath) || /^\/api\/orders\/[^/]+\/returns$/.test(req.apiPath) || /^\/api\/payments\/[^/]+\/refunds$/.test(req.apiPath))) return next();
    return idempotencyMiddleware(req, res, next);
});

app.use((req, res, next) => {
    if (protectedRoutePrefixes.some((prefix) => req.apiPath === prefix || req.apiPath.startsWith(`${prefix}/`))) {
        if (!req.get("Authorization")) return res.status(401).json({ success: false, message: "Authentication required", requestId: req.requestId });
    }
    next();
});

for (const config of serviceConfigs) {
    const routes = [config.path, `/v1${config.path}`];
    for (const route of routes) {
        app.all(route, (req, res, next) => proxyRequest(config, req, res, next));
        app.all(`${route}/*`, (req, res, next) => proxyRequest(config, req, res, next));
    }
}

app.use((req, res) => res.status(404).json({ success: false, message: "Route not found", requestId: req.requestId }));

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = error.status || error.statusCode || 500;
    if (error.name === "ValidationError" || error.name === "CastError") error.status = 400;
    const actualStatus = error.status || status;
    console.error(JSON.stringify({ level: "error", service: "api-gateway", requestId: req.requestId, method: req.method, path: req.originalUrl, status: actualStatus, error: error.message }));
    res.status(actualStatus).json({ success: false, message: actualStatus >= 500 ? "Internal server error" : error.message, requestId: req.requestId });
});

module.exports = app;
