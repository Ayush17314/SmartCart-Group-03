module.exports = {
    openapi: "3.0.3",
    info: {
        title: "SmartCart API",
        version: "1.0.0",
        description: "Versioned REST API for SmartCart. Requests and responses support JSON; product listings also support XML.",
    },
    servers: [{ url: "/v1", description: "Version 1 API through the gateway" }],
    components: {
        securitySchemes: { bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" } },
        schemas: {
            Error: { type: "object", required: ["success", "message", "requestId"], properties: { success: { type: "boolean", enum: [false] }, message: { type: "string" }, requestId: { type: "string" } } },
            Product: { type: "object", properties: { _id: { type: "string" }, name: { type: "string" }, price: { type: "number" }, category: { type: "string" }, stock: { type: "integer" } } },
            ProductInput: { type: "object", required: ["name", "price", "category"], properties: { name: { type: "string", maxLength: 200 }, sku: { type: "string", maxLength: 80 }, description: { type: "string" }, price: { type: "number", minimum: 0 }, category: { type: "string" }, brand: { type: "string" }, stock: { type: "integer", minimum: 0 }, stockAdjustmentReason: { type: "string", maxLength: 500 }, images: { type: "array", items: { type: "string", format: "uri", pattern: "^https://" } } } },
            ProductList: { type: "object", properties: { success: { type: "boolean" }, data: { type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Product" } }, pagination: { type: "object", properties: { nextCursor: { type: "string", nullable: true } } }, links: { type: "object", properties: { next: { type: "string", nullable: true } } } } } } },
            OrderInput: { type: "object", required: ["items"], properties: { items: { type: "array", minItems: 1, items: { type: "object", required: ["productId", "quantity"], properties: { productId: { type: "string" }, quantity: { type: "integer", minimum: 1 } } } }, shippingAddress: { type: "object" }, paymentMethod: { type: "string", enum: ["UPI", "CARD", "COD"] }, couponCode: { type: "string", minLength: 3, maxLength: 32 } } },
        },
        parameters: {
            IdempotencyKey: { in: "header", name: "Idempotency-Key", required: true, schema: { type: "string", maxLength: 200 } },
            Cursor: { in: "query", name: "after", schema: { type: "string" }, description: "Opaque cursor returned by the previous page" },
            Limit: { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
        },
        responses: {
            Error: { description: "Standard API error body", content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } },
            NotModified: { description: "Cached representation has not changed" },
            RateLimited: { description: "Rate limit exceeded", headers: { "RateLimit-Limit": { schema: { type: "integer" } }, "RateLimit-Remaining": { schema: { type: "integer" } }, "Retry-After": { schema: { type: "integer" } } } },
        },
    },
    paths: {
        "/api/products": {
            get: {
                summary: "List products using cursor pagination",
                parameters: [
                    { $ref: "#/components/parameters/Cursor" }, { $ref: "#/components/parameters/Limit" },
                    { in: "query", name: "search", schema: { type: "string" } },
                    { in: "query", name: "category", schema: { type: "string" } },
                    { in: "header", name: "If-None-Match", schema: { type: "string" } },
                    { in: "header", name: "Accept", schema: { type: "string", enum: ["application/json", "application/xml"] } },
                ],
                responses: { "200": { description: "Product page", headers: { ETag: { schema: { type: "string" } }, Link: { schema: { type: "string" } }, "Cache-Control": { schema: { type: "string" } } }, content: { "application/json": { schema: { $ref: "#/components/schemas/ProductList" } }, "application/xml": { schema: { type: "string" } } } }, "304": { $ref: "#/components/responses/NotModified" }, "429": { $ref: "#/components/responses/RateLimited" }, "500": { $ref: "#/components/responses/Error" } },
            },
            post: { security: [{ bearerAuth: [] }], summary: "Create a product", parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProductInput" } } } }, responses: { "201": { description: "Created" }, "400": { $ref: "#/components/responses/Error" }, "401": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" }, "429": { $ref: "#/components/responses/RateLimited" } } },
        },
        "/api/products/brands": { get: { summary: "List active product brands with product counts", responses: { "200": { description: "Brand list" } } } },
        "/api/products/{id}": {
            get: { summary: "Get a product", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }, { in: "header", name: "If-None-Match", schema: { type: "string" } }], responses: { "200": { description: "Product" }, "304": { $ref: "#/components/responses/NotModified" }, "404": { $ref: "#/components/responses/Error" } } },
            put: { security: [{ bearerAuth: [] }], summary: "Replace product details", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ProductInput" } } } }, responses: { "200": { description: "Updated" }, "404": { $ref: "#/components/responses/Error" } } },
            delete: { security: [{ bearerAuth: [] }], summary: "Archive a product without removing historical order data", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "200": { description: "Archived" }, "404": { $ref: "#/components/responses/Error" } } },
        },
        "/api/products/admin": {
            get: { security: [{ bearerAuth: [] }], summary: "Search, filter, sort, and paginate products for authorized staff", parameters: [{ in: "query", name: "page", schema: { type: "integer", minimum: 1 } }, { $ref: "#/components/parameters/Limit" }, { in: "query", name: "search", schema: { type: "string" } }, { in: "query", name: "category", schema: { type: "string" } }, { in: "query", name: "brand", schema: { type: "string" } }, { in: "query", name: "sort", schema: { type: "string", enum: ["name", "price", "stock", "updatedAt"] } }, { in: "query", name: "order", schema: { type: "string", enum: ["asc", "desc"] } }, { in: "query", name: "archived", schema: { type: "string", enum: ["true", "false", "all"] } }], responses: { "200": { description: "Product administration page" }, "400": { $ref: "#/components/responses/Error" }, "401": { $ref: "#/components/responses/Error" }, "403": { $ref: "#/components/responses/Error" } } },
        },
        "/api/products/admin/inventory-summary": { get: { security: [{ bearerAuth: [] }], summary: "Get live product and low-stock totals", responses: { "200": { description: "Inventory summary" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/products/admin/report": { get: { security: [{ bearerAuth: [] }], summary: "Search inventory and export the filtered product report as CSV", parameters: [{ in: "query", name: "from", schema: { type: "string", format: "date-time" } }, { in: "query", name: "to", schema: { type: "string", format: "date-time" } }, { in: "query", name: "search", schema: { type: "string" } }, { in: "query", name: "category", schema: { type: "string" } }, { in: "query", name: "brand", schema: { type: "string" } }, { in: "query", name: "format", schema: { type: "string", enum: ["csv"] } }, { in: "query", name: "page", schema: { type: "integer", minimum: 1 } }, { $ref: "#/components/parameters/Limit" }], responses: { "200": { description: "Filtered product report or CSV export" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/products/admin/audit": { get: { security: [{ bearerAuth: [] }], summary: "Read product report export audit events", responses: { "200": { description: "Product audit events" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/products/{id}/inventory-movements": { get: { security: [{ bearerAuth: [] }], summary: "Read stock adjustment history", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "200": { description: "Inventory change history" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/orders": {
            get: { security: [{ bearerAuth: [] }], summary: "List the caller’s orders", parameters: [{ $ref: "#/components/parameters/Cursor" }, { $ref: "#/components/parameters/Limit" }], responses: { "200": { description: "Orders" }, "401": { $ref: "#/components/responses/Error" } } },
            post: { security: [{ bearerAuth: [] }], summary: "Create an order", parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/OrderInput" } } } }, responses: { "201": { description: "Order created" }, "400": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" }, "503": { $ref: "#/components/responses/Error" } } },
        },
        "/api/orders/quote": { post: { security: [{ bearerAuth: [] }], summary: "Calculate current server-side tax, shipping, and order total", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["items"], properties: { items: { type: "array", minItems: 1, items: { type: "object", required: ["productId", "quantity"], properties: { productId: { type: "string" }, quantity: { type: "integer", minimum: 1 } } } } } } } } }, responses: { "200": { description: "Trusted checkout quote" }, "400": { $ref: "#/components/responses/Error" }, "401": { $ref: "#/components/responses/Error" } } } },
        "/api/promotions/apply": { post: { security: [{ bearerAuth: [] }], summary: "Validate a coupon against current product prices", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["items", "code"], properties: { items: { type: "array", minItems: 1, items: { type: "object", required: ["productId", "quantity"], properties: { productId: { type: "string" }, quantity: { type: "integer", minimum: 1 } } } }, code: { type: "string", minLength: 3, maxLength: 32 } } } } } }, responses: { "200": { description: "Validated coupon quote" }, "400": { $ref: "#/components/responses/Error" }, "401": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" } } } },
        "/api/promotions": { get: { security: [{ bearerAuth: [] }], summary: "List coupons for promotion managers", responses: { "200": { description: "Promotion page" }, "403": { $ref: "#/components/responses/Error" } } }, post: { security: [{ bearerAuth: [] }], summary: "Create a coupon", responses: { "201": { description: "Coupon created" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/promotions/{id}": { put: { security: [{ bearerAuth: [] }], summary: "Edit a coupon", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "200": { description: "Coupon updated" }, "403": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" } } } },
        "/api/orders/admin/report": { get: { security: [{ bearerAuth: [] }], summary: "Get paginated order and sales reports or export the current page as CSV", parameters: [{ in: "query", name: "from", schema: { type: "string", format: "date-time" } }, { in: "query", name: "to", schema: { type: "string", format: "date-time" } }, { in: "query", name: "page", schema: { type: "integer", minimum: 1 } }, { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 1000 } }, { in: "query", name: "format", schema: { type: "string", enum: ["csv"] } }], responses: { "200": { description: "Paginated order report or CSV file" }, "400": { $ref: "#/components/responses/Error" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/orders/admin/audit": { get: { security: [{ bearerAuth: [] }], summary: "Read promotion and report export audit events", responses: { "200": { description: "Business audit events" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/settings": { get: { security: [{ bearerAuth: [] }], summary: "Read store business settings", responses: { "200": { description: "Store settings" }, "403": { $ref: "#/components/responses/Error" } } }, put: { security: [{ bearerAuth: [] }], summary: "Update store business settings", responses: { "200": { description: "Settings saved" }, "400": { $ref: "#/components/responses/Error" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/settings/public": { get: { summary: "Read non-sensitive public store settings", responses: { "200": { description: "Public store settings" } } } },
        "/api/products/{id}/reviews": { get: { summary: "List approved reviews for a product", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }, { $ref: "#/components/parameters/Limit" }], responses: { "200": { description: "Paginated reviews" } } }, post: { security: [{ bearerAuth: [] }], summary: "Submit a review after a delivered purchase", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "201": { description: "Review queued for moderation" }, "403": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" } } } },
        "/api/reviews/admin": { get: { security: [{ bearerAuth: [] }], summary: "List reviews for moderation", parameters: [{ in: "query", name: "status", schema: { type: "string", enum: ["PENDING", "APPROVED", "HIDDEN", "REMOVED", "REPORTED"] } }], responses: { "200": { description: "Review moderation queue" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/reviews/{id}/report": { post: { security: [{ bearerAuth: [] }], summary: "Report a review", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "200": { description: "Report recorded" }, "404": { $ref: "#/components/responses/Error" } } } },
        "/api/reviews/{id}/moderation": { patch: { security: [{ bearerAuth: [] }], summary: "Approve, hide, or remove a review", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "200": { description: "Moderation recorded with history" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/orders/admin/summary": { get: { security: [{ bearerAuth: [] }], summary: "Get live order, payment, sales, and trend totals", parameters: [{ in: "query", name: "days", schema: { type: "integer", enum: [7, 30, 90] } }], responses: { "200": { description: "Order summary" }, "400": { $ref: "#/components/responses/Error" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/orders/admin/top-products": { get: { security: [{ bearerAuth: [] }], summary: "Get top selling products from paid orders", parameters: [{ in: "query", name: "from", schema: { type: "string", format: "date-time" } }, { in: "query", name: "to", schema: { type: "string", format: "date-time" } }, { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 20 } }], responses: { "200": { description: "Top products" }, "400": { $ref: "#/components/responses/Error" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/orders/{id}/cancellation": { patch: { security: [{ bearerAuth: [] }], summary: "Cancel an eligible order", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "200": { description: "Order cancelled" }, "401": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" } } } },
        "/api/orders/{id}/returns": { post: { security: [{ bearerAuth: [] }], summary: "Request a return within 30 days of delivery", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }, { $ref: "#/components/parameters/IdempotencyKey" }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["reason"], properties: { reason: { type: "string", minLength: 3, maxLength: 500 } } } } } }, responses: { "201": { description: "Return request created" }, "401": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" } } } },
        "/api/orders/{id}/return-review": { patch: { security: [{ bearerAuth: [] }], summary: "Approve or reject a return request", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["status"], properties: { status: { type: "string", enum: ["APPROVED", "REJECTED"] }, note: { type: "string", maxLength: 500 } } } } } }, responses: { "200": { description: "Return reviewed" }, "403": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" } } } },
        "/api/orders/{id}/return-complete": { post: { security: [{ bearerAuth: [] }], summary: "Record receipt and inspection of an approved return", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "200": { description: "Return completed" }, "403": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/register": {
            post: {
                summary: "Register a customer",
                requestBody: { required: true, content: { "application/json": { schema: {
                    type: "object", required: ["name", "email", "password"],
                    properties: { name: { type: "string" }, email: { type: "string", format: "email" }, password: { type: "string", minLength: 8 } },
                } } } },
                responses: { "201": { description: "Registered" }, "400": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" } },
            },
        },
        "/api/auth/login": {
            post: {
                summary: "Customer login (legacy path; customer accounts only)",
                requestBody: { required: true, content: { "application/json": { schema: {
                    type: "object", required: ["email", "password"], properties: { email: { type: "string" }, password: { type: "string" } },
                } } } },
                responses: { "200": { description: "Trusted Next.js server receives the JWT for an HttpOnly cookie; the browser receives only the user profile" }, "401": { $ref: "#/components/responses/Error" } },
            },
        },
        "/api/auth/customer-login": {
            post: {
                summary: "Log in to a customer account",
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string" }, password: { type: "string" } } } } } },
                responses: { "200": { description: "Customer profile; trusted Next.js server receives the JWT for an HttpOnly cookie" }, "401": { $ref: "#/components/responses/Error" } },
            },
        },
        "/api/auth/staff-login": {
            post: {
                summary: "Log in to an invited staff or administrator account",
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string" }, password: { type: "string" } } } } } },
                responses: { "200": { description: "Staff profile; trusted Next.js server receives the JWT for an HttpOnly cookie" }, "401": { $ref: "#/components/responses/Error" }, "403": { $ref: "#/components/responses/Error" } },
            },
        },
        "/api/auth/super-admin-login": {
            post: {
                summary: "Log in to a Super Admin account",
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email", "password"], properties: { email: { type: "string" }, password: { type: "string" } } } } } },
                responses: { "200": { description: "Starts a five-minute email verification challenge; no session is issued until verification succeeds" }, "401": { $ref: "#/components/responses/Error" }, "403": { $ref: "#/components/responses/Error" } },
            },
        },
        "/api/auth/super-admin-verify": {
            post: {
                summary: "Verify a Super Admin sign-in code and issue the session",
                requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["challengeId", "code"], properties: { challengeId: { type: "string" }, code: { type: "string", pattern: "^\\d{6}$" } } } } } },
                responses: { "200": { description: "Verified Super Admin profile; trusted Next.js server receives the JWT for an HttpOnly cookie" }, "401": { $ref: "#/components/responses/Error" } },
            },
        },
        "/api/auth/verify-email": { post: { summary: "Verify a one-time email token", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token"], properties: { token: { type: "string" } } } } } }, responses: { "200": { description: "Email verified" }, "400": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/resend-verification": { post: { summary: "Request another verification email", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } } }, responses: { "200": { description: "Generic response to prevent account enumeration" } } } },
        "/api/auth/forgot-password": { post: { summary: "Request a password reset link", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["email"], properties: { email: { type: "string", format: "email" } } } } } }, responses: { "200": { description: "Generic response to prevent account enumeration" } } } },
        "/api/auth/reset-password": { post: { summary: "Set a new password using a one-time token", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token", "password"], properties: { token: { type: "string" }, password: { type: "string", minLength: 8, maxLength: 128 } } } } } }, responses: { "200": { description: "Password updated and previous sessions revoked" }, "400": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/session": { get: { security: [{ bearerAuth: [] }], summary: "Validate the current session and return current profile and permissions", responses: { "200": { description: "Current user" }, "401": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/logout": { post: { security: [{ bearerAuth: [] }], summary: "Revoke the current token version", responses: { "200": { description: "Session revoked" }, "401": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/admin/summary": { get: { security: [{ bearerAuth: [] }], summary: "Get customer counts for the admin dashboard", responses: { "200": { description: "Customer metrics" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/customers": { get: { security: [{ bearerAuth: [] }], summary: "Search and paginate customer accounts", parameters: [{ in: "query", name: "page", schema: { type: "integer", minimum: 1 } }, { $ref: "#/components/parameters/Limit" }, { in: "query", name: "search", schema: { type: "string" } }, { in: "query", name: "status", schema: { type: "string", enum: ["active", "suspended"] } }], responses: { "200": { description: "Customer page" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/customers/export": { get: { security: [{ bearerAuth: [] }], summary: "Export filtered customer records as CSV", parameters: [{ in: "query", name: "search", schema: { type: "string" } }, { in: "query", name: "status", schema: { type: "string", enum: ["active", "suspended"] } }, { in: "query", name: "from", schema: { type: "string", format: "date-time" } }, { in: "query", name: "to", schema: { type: "string", format: "date-time" } }, { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 5000 } }], responses: { "200": { description: "Customer CSV file" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/users": { get: { security: [{ bearerAuth: [] }], summary: "List staff accounts", responses: { "200": { description: "Staff accounts" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/users/invite": { post: { security: [{ bearerAuth: [] }], summary: "Invite a staff member with a single-use 24-hour password setup link; only Super Admins can invite Super Admins", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["name", "email", "role"], properties: { name: { type: "string", minLength: 2, maxLength: 200 }, email: { type: "string", format: "email" }, role: { type: "string", enum: ["support", "inventory_staff", "admin", "super_admin"] } } } } } }, responses: { "201": { description: "Staff invitation sent" }, "400": { $ref: "#/components/responses/Error" }, "403": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" }, "503": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/users/{id}/resend-invite": { post: { security: [{ bearerAuth: [] }], summary: "Rotate and resend a pending staff invitation", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "200": { description: "Invitation resent" }, "403": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/accept-staff-invite": { post: { summary: "Accept a staff invitation and set the account password", requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["token", "password"], properties: { token: { type: "string" }, password: { type: "string", minLength: 8, maxLength: 128 } } } } } }, responses: { "200": { description: "Invitation accepted and email verified" }, "400": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/users/{id}/role": { put: { security: [{ bearerAuth: [] }], summary: "Change a staff role; Super Admin privileges are restricted", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["role"], properties: { role: { type: "string", enum: ["customer", "support", "inventory_staff", "admin", "super_admin"] } } } } } }, responses: { "200": { description: "Role updated and prior token sessions revoked" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/users/{id}/status": { patch: { security: [{ bearerAuth: [] }], summary: "Suspend or reactivate an account with an audit reason", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["isActive", "reason"], properties: { isActive: { type: "boolean" }, reason: { type: "string" } } } } } }, responses: { "200": { description: "Account status updated and prior token sessions revoked" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/auth/audit": { get: { security: [{ bearerAuth: [] }], summary: "Read recent authentication and account-management audit events", parameters: [{ in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100 } }], responses: { "200": { description: "Audit events" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/notifications": { get: { security: [{ bearerAuth: [] }], summary: "List persisted notification delivery records", parameters: [{ in: "query", name: "page", schema: { type: "integer", minimum: 1 } }, { $ref: "#/components/parameters/Limit" }, { in: "query", name: "status", schema: { type: "string", enum: ["QUEUED", "SENDING", "SENT", "MOCKED", "FAILED", "UNCERTAIN", "SKIPPED"] } }], responses: { "200": { description: "Notification page" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/notifications/{type}": { post: { security: [{ bearerAuth: [] }], summary: "Queue an authorized notification event", parameters: [{ in: "path", name: "type", required: true, schema: { type: "string", enum: ["email", "order", "payment", "sms"] } }, { in: "header", name: "Idempotency-Key", schema: { type: "string", maxLength: 200 } }], requestBody: { required: true, content: { "application/json": { schema: { type: "object", required: ["userId", "event"], properties: { userId: { type: "string" }, event: { type: "string" }, orderId: { type: "string" }, status: { type: "string" } } } } } }, responses: { "202": { description: "Queued or existing idempotent notification" }, "403": { $ref: "#/components/responses/Error" }, "503": { $ref: "#/components/responses/Error" } } } },
        "/api/notifications/{id}/retry": { post: { security: [{ bearerAuth: [] }], summary: "Requeue a failed notification", parameters: [{ in: "path", name: "id", required: true, schema: { type: "string" } }], responses: { "202": { description: "Notification requeued" }, "403": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" } } } },
        "/api/payments/create": {
            post: {
                security: [{ bearerAuth: [] }], summary: "Create an idempotent Razorpay checkout order",
                parameters: [{ $ref: "#/components/parameters/IdempotencyKey" }],
                requestBody: { required: true, content: { "application/json": { schema: {
                    type: "object", required: ["orderId", "amount", "paymentMethod"],
                    properties: { orderId: { type: "string" }, amount: { type: "number", exclusiveMinimum: 0 }, paymentMethod: { type: "string", enum: ["UPI", "CARD", "COD"] } },
                } } } },
                responses: { "201": { description: "Checkout order" }, "401": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" }, "503": { $ref: "#/components/responses/Error" } },
            },
        },
        "/api/payments/admin/reconciliation": { get: { security: [{ bearerAuth: [] }], summary: "Read or export payment and refund reconciliation records", parameters: [{ in: "query", name: "from", schema: { type: "string", format: "date-time" } }, { in: "query", name: "to", schema: { type: "string", format: "date-time" } }, { in: "query", name: "status", schema: { type: "string", enum: ["PENDING", "SUCCESS", "FAILED", "REFUNDED"] } }, { in: "query", name: "paymentMethod", schema: { type: "string", enum: ["UPI", "CARD", "COD"] } }, { in: "query", name: "page", schema: { type: "integer", minimum: 1 } }, { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 5000 } }, { in: "query", name: "format", schema: { type: "string", enum: ["csv"] } }], responses: { "200": { description: "Paginated payment data or CSV reconciliation export" }, "400": { $ref: "#/components/responses/Error" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/payments/admin/audit": { get: { security: [{ bearerAuth: [] }], summary: "Read payment reconciliation export audit events", parameters: [{ in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100 } }], responses: { "200": { description: "Payment audit events" }, "403": { $ref: "#/components/responses/Error" } } } },
        "/api/payments/verify/{paymentId}": {
            post: {
                security: [{ bearerAuth: [] }], summary: "Verify Razorpay Checkout signature",
                parameters: [{ in: "path", name: "paymentId", required: true, schema: { type: "string" } }, { $ref: "#/components/parameters/IdempotencyKey" }],
                responses: { "200": { description: "Payment verified" }, "401": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" } },
            },
        },
        "/api/payments/{paymentId}/refunds": {
            post: {
                security: [{ bearerAuth: [] }], summary: "Issue a payment refund",
                parameters: [{ in: "path", name: "paymentId", required: true, schema: { type: "string" } }],
                responses: { "200": { description: "Refund submitted" }, "401": { $ref: "#/components/responses/Error" }, "409": { $ref: "#/components/responses/Error" } },
            },
        },
    },
};
