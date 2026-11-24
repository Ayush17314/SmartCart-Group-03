process.env.NODE_ENV = "test";
process.env.IDEMPOTENCY_STORE = "memory";
process.env.RATE_LIMIT_MAX = "120";
process.env.JWT_SECRET = "test-secret";

const http = require("http");
const request = require("supertest");
const app = require("../src/app");

describe("SmartCart API gateway", () => {
    let upstream;
    let upstreamUrl;
    let products = [];
    let authPaths = [];

    beforeAll(async () => {
        upstream = http.createServer((req, res) => {
            if (req.method === "POST") {
                let body = "";
                req.on("data", (chunk) => { body += chunk; });
                req.on("end", () => {
                    if (req.url.startsWith("/api/auth/")) {
                        authPaths.push(req.url);
                        res.statusCode = 200;
                        res.setHeader("Content-Type", "application/json");
                        res.end(JSON.stringify({ success: true, data: { user: { id: "u1" }, token: "private-jwt" } }));
                        return;
                    }
                    products.push(JSON.parse(body));
                    res.statusCode = 201;
                    res.setHeader("Content-Type", "application/json");
                    res.end(JSON.stringify({ success: true, data: { id: products.length } }));
                });
                return;
            }
            if ((req.headers.accept || "").includes("application/xml") || (req.headers.accept || "").includes("text/xml")) {
                res.setHeader("Content-Type", "application/xml");
                res.end("<?xml version=\"1.0\" encoding=\"UTF-8\"?><response><success>true</success></response>");
                return;
            }
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ success: true, data: { items: [{ _id: "p1", name: "Desk lamp", price: 20, category: "home", stock: 4 }], pagination: { nextCursor: null }, links: { next: null } } }));
        });
        await new Promise((resolve) => upstream.listen(0, "127.0.0.1", resolve));
        upstreamUrl = `http://127.0.0.1:${upstream.address().port}`;
        process.env.PRODUCT_SERVICE_URL = upstreamUrl;
    });

    afterAll(async () => new Promise((resolve) => upstream.close(resolve)));

    beforeEach(() => { products = []; authPaths = []; });

    test("serves health and documents", async () => {
        await request(app).get("/health").expect(200).expect("Cache-Control", "no-store");
        await request(app).get("/openapi.json").expect(200).expect((response) => {
            if (!response.body.paths["/api/products"]) throw new Error("OpenAPI paths are missing");
        });
        await request(app).get("/docs/").expect(200);
    });

    test("validates product bodies with AJV before proxying", async () => {
        await request(app).post("/api/products").set("Idempotency-Key", "bad-product").send({ name: "", price: -1 }).expect(400);
        expect(products).toHaveLength(0);
    });

    test("accepts a bounded coupon code on validated order requests", () => {
        const { validateBody } = require("../src/schemas");
        const validate = validateBody("orderCreate");
        let validError;
        validate({ body: { items: [{ productId: "p1", quantity: 1 }], couponCode: "SAVE_10" } }, {}, (error) => { validError = error; });
        expect(validError).toBeUndefined();
        let invalidError;
        validate({ body: { items: [{ productId: "p1", quantity: 1 }], couponCode: "TOO LONG!".repeat(5) } }, {}, (error) => { invalidError = error; });
        expect(invalidError.status).toBe(400);
    });

    test("routes public settings through the product service", async () => {
        const response = await request(app).get("/api/settings/public").expect(200);
        expect(response.body.data.items[0].name).toBe("Desk lamp");
    });

    test("only returns login JWTs to the trusted server exchange", async () => {
        process.env.AUTH_SERVICE_URL = upstreamUrl;
        const publicResponse = await request(app).post("/api/auth/login").send({ email: "user@example.com", password: "password" }).expect(200);
        expect(publicResponse.body.data).toEqual({ user: { id: "u1" } });
        const trustedResponse = await request(app).post("/api/auth/login").set("X-Auth-Exchange-Secret", "local-auth-exchange-secret-change-me").send({ email: "user@example.com", password: "password" }).expect(200);
        expect(trustedResponse.body.data.token).toBe("private-jwt");
    });

    test("routes all three login portals through Auth Service and keeps JWTs private", async () => {
        process.env.AUTH_SERVICE_URL = upstreamUrl;
        for (const path of ["customer-login", "staff-login", "super-admin-login"]) {
            const response = await request(app).post(`/api/auth/${path}`).send({ email: "user@example.com", password: "password" }).expect(200);
            expect(response.body.data).toEqual({ user: { id: "u1" } });
        }
        await request(app).post("/api/auth/super-admin-verify").send({ challengeId: "A".repeat(43), code: "123456" }).expect(200);
        await request(app).post("/api/auth/super-admin-verify").send({ challengeId: "short", code: "12" }).expect(400);
        expect(authPaths).toEqual(["/api/auth/customer-login", "/api/auth/staff-login", "/api/auth/super-admin-login", "/api/auth/super-admin-verify"]);
    });

    test("routes versioned GET requests and emits ETags", async () => {
        const response = await request(app).get("/v1/api/products?limit=1").expect(200);
        expect(response.headers.etag).toBeTruthy();
        expect(response.headers["x-request-id"]).toBeTruthy();
        expect(response.body.data.items[0].name).toBe("Desk lamp");
        await request(app).get("/v1/api/products?limit=1").set("If-None-Match", response.headers.etag).expect(304);
    });

    test("replays idempotent POST responses and rejects a changed payload", async () => {
        const body = { name: "Desk lamp", price: 20, category: "home" };
        const first = await request(app).post("/v1/api/products").set("Idempotency-Key", "product-key-1").send(body).expect(201);
        await request(app).post("/v1/api/products").set("Idempotency-Key", "product-key-1").send(body).expect(201).expect("Idempotency-Replayed", "true");
        await request(app).post("/v1/api/products").set("Idempotency-Key", "product-key-1").send({ ...body, price: 22 }).expect(409);
        expect(first.body.data.id).toBe(1);
        expect(products).toHaveLength(1);
    });

    test("normalizes missing routes and applies rate limit headers", async () => {
        const response = await request(app).get("/api/unknown").expect(404);
        expect(response.body).toMatchObject({ success: false, message: "Route not found" });
        expect(response.headers["ratelimit-limit"]).toBe("120");
    });

    test("opens a circuit after repeated upstream failures", async () => {
        const { CircuitBreaker, CircuitOpenError } = require("../src/resilience");
        const breaker = new CircuitBreaker({ failureThreshold: 2, resetTimeoutMs: 10_000 });
        const fail = () => breaker.execute("broken", async () => { throw new Error("offline"); });
        await expect(fail()).rejects.toThrow("offline");
        await expect(fail()).rejects.toThrow("offline");
        await expect(fail()).rejects.toBeInstanceOf(CircuitOpenError);
    });

    test("negotiates XML when client requests Accept application/xml", async () => {
        const response = await request(app)
            .get("/v1/api/products?limit=1")
            .set("Accept", "application/xml")
            .expect(200);
        expect(response.headers["content-type"]).toMatch(/application\/xml/);
        expect(response.text).toContain("<?xml");
    });

    test("enforces uniform error envelope with requestId across 400, 401, and 404", async () => {
        const bad400 = await request(app).post("/api/products").set("Idempotency-Key", "bad").send({}).expect(400);
        expect(bad400.body).toMatchObject({ success: false, message: expect.any(String), requestId: expect.any(String) });

        const unauth401 = await request(app).get("/api/cart").expect(401);
        expect(unauth401.body).toMatchObject({ success: false, message: "Authentication required", requestId: expect.any(String) });

        const missing404 = await request(app).get("/api/nonexistent-endpoint").expect(404);
        expect(missing404.body).toMatchObject({ success: false, message: "Route not found", requestId: expect.any(String) });
        expect(missing404.headers["content-type"]).toMatch(/application\/problem\+json/);
        expect(missing404.body.type).toBe("urn:smartcart:error:not-found");
    });

    test("implements OPTIONS with explicit Allow header", async () => {
        const response = await request(app).options("/api/products").expect(204);
        expect(response.headers.allow).toBe("GET, POST, OPTIONS, HEAD");
    });

    test("rejects unsupported Accept headers with 406 Not Acceptable", async () => {
        const response = await request(app)
            .get("/api/products")
            .set("Accept", "text/csv")
            .expect(406);
        expect(response.headers["content-type"]).toMatch(/application\/problem\+json/);
        expect(response.body.type).toBe("urn:smartcart:error:not-acceptable");
    });

    test("returns RFC 7807/9457 Problem Details with errors[] array on validation error", async () => {
        const response = await request(app)
            .post("/api/products")
            .set("Idempotency-Key", "bad-prod-multi")
            .send({ name: "", price: -5 })
            .expect(400);
        expect(response.headers["content-type"]).toMatch(/application\/problem\+json/);
        expect(response.body.type).toBe("urn:smartcart:error:validation-error");
        expect(Array.isArray(response.body.errors)).toBe(true);
        expect(response.body.errors.length).toBeGreaterThan(0);
        expect(response.body.errors[0]).toHaveProperty("field");
        expect(response.body.errors[0]).toHaveProperty("message");
    });
});


