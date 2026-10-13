# SmartCart Web

Next.js App Router storefront for the SmartCart REST API.

## Run locally

```sh
corepack pnpm install
copy .env.example .env.local
corepack pnpm dev
```

Set `API_URL` to the running API gateway (default `http://localhost:4000`).
The gateway source and GraphQL schema are not present in this repository, so
the storefront calls the documented REST paths implemented by the backend
services through the gateway's documented REST forwarding.

## Checks and containers

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
docker compose up --build
```

Authentication tokens are kept in an HTTP-only cookie by the Next route handlers.
Email verification and password recovery use the Auth Service email provider;
the development mock returns local-only links and sends no email. UPI and card
checkout use the Razorpay integration documented in `Backend/payment-service/README.md`.
