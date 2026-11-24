# SmartCart API Gateway

The API Gateway is the central entrypoint and reverse-proxy for the SmartCart distributed platform. Running on port `4000`, it decouples client applications from internal microservices, enforcing centralized rate limiting, AJV schema validation, idempotent request caching, GraphQL queries, and interactive Swagger/OpenAPI documentation.

---

## Architectural Responsibilities

- **Reverse Proxy Routing:** Forwards `/api/*` and versioned `/v1/api/*` routes to backend microservices using `http-proxy-middleware`.
- **Pre-Proxy Schema Validation:** Uses AJV to validate incoming request bodies (auth, products, orders, payments) before forwarding to services, immediately returning `400 Bad Request` or `422 Unprocessable Entity` on schema errors.
- **MySQL & In-Memory Idempotency:** Tracks `Idempotency-Key` headers for mutating POST operations (`/api/orders`, `/api/payments/create`, `/api/products`, `/api/cart/items`). Persists request hashes and responses in MySQL (`smartcart.api_idempotency`), automatically falling back to an in-memory cache if MySQL is offline.
- **Circuit Breakers & Resilience:** Protects inter-service communication with circuit breakers (`failureThreshold: 5`, `resetTimeoutMs: 15s`) and exponential backoff retries.
- **Content Negotiation:** Supports `Accept: application/json` and `application/xml` with `Vary: Accept`, returning `406 Not Acceptable` when unsupported.
- **Rate Limiting:** Protects platform APIs against DDoS and brute-force abuse, returning `429 Too Many Requests` with standard `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, and `Retry-After` headers.
- **GraphQL API:** Provides a unified GraphQL endpoint at `/graphql` for flexible product catalog queries.
- **Interactive Documentation:** Serves the OpenAPI 3.0 specification interactively via Swagger UI at `/docs`.

---

## Service Routing Map

| Route Prefix | Target Microservice | Default Target URL |
|:---|:---|:---|
| `/api/auth/*` | Auth Service | `http://localhost:4001` |
| `/api/products/*` | Product Service | `http://localhost:4002` |
| `/api/reviews/*` | Product Service | `http://localhost:4002` |
| `/api/settings/*` | Product Service | `http://localhost:4002` |
| `/api/cart/*` | Cart Service | `http://localhost:4003` |
| `/api/wishlist/*` | Wishlist Service | `http://localhost:4004` |
| `/api/orders/*` | Order Service | `http://localhost:4005` |
| `/api/promotions/*` | Order Service | `http://localhost:4005` |
| `/api/payments/*` | Payment Service | `http://localhost:4006` |
| `/api/notifications/*` | Notification Service | `http://localhost:4007` |

---

## Key Endpoints

- **Swagger Documentation:** `GET http://localhost:4000/docs`
- **OpenAPI JSON Spec:** `GET http://localhost:4000/openapi.json`
- **GraphQL Endpoint:** `POST http://localhost:4000/graphql`
- **Health Check:** `GET http://localhost:4000/health`

---

## Environment Configuration

Configure in `Backend/.env` or `Backend/api-gateway/.env`:

```env
PORT=4000
NODE_ENV=development
AUTH_EXCHANGE_SECRET=local-auth-exchange-secret-change-me

# Target Microservice URLs
AUTH_SERVICE_URL=http://localhost:4001
PRODUCT_SERVICE_URL=http://localhost:4002
CART_SERVICE_URL=http://localhost:4003
WISHLIST_SERVICE_URL=http://localhost:4004
ORDER_SERVICE_URL=http://localhost:4005
PAYMENT_SERVICE_URL=http://localhost:4006
NOTIFICATION_SERVICE_URL=http://localhost:4007

# MySQL Idempotency & Audit Store
SQL_HOST=localhost
SQL_PORT=3306
SQL_USER=smartcart
SQL_PASSWORD=local-sql-password-change-me
SQL_DATABASE=smartcart

# Security & Limits
CORS_ORIGIN=http://localhost:3000
RATE_LIMIT_MAX=120
RATE_LIMIT_WINDOW_MS=60000
CIRCUIT_FAILURE_THRESHOLD=5
CIRCUIT_RESET_TIMEOUT_MS=15000
```

---

## Running & Testing

```bash
# Start in development mode with nodemon
npm run dev

# Run comprehensive test suite (Jest + Supertest)
npm test
```
*Test suite validates AJV validation, versioned `/v1/api` routing, ETag 304 caching, idempotent replay, rate limiting, and circuit breaker trip logic.*
