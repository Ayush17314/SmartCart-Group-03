# SmartCart

SmartCart is an Amazon-inspired e-commerce web application built with a microservices architecture. The backend uses Node.js, Express.js, and MongoDB, so each business area can be developed and deployed independently.

## Features

- User registration and login
- Product browsing, searching, and filtering
- Shopping cart management
- Wishlist management
- Payment creation, verification, refund processing, and payment history
- Order creation and order tracking
- Customer authentication, email verification, and password recovery
- Permission-gated administration for products, inventory, orders, customers, staff, returns, notifications, and audit history
- Server-validated coupon promotions and customer product reviews with moderation
- Paginated order/sales reports with bounded CSV export
- Store identity, inventory threshold, return-policy, and operational settings

## Architecture

```text
SmartCart/
├── Backend/
│   ├── auth-service/          # Registration, login, and authentication
│   ├── product-service/       # Product catalogue, search, and filters
│   ├── cart-service/          # Cart items and quantities
│   ├── wishlist-service/      # Saved products
│   ├── order-service/         # Orders and delivery tracking
│   ├── payment-service/       # Payments, refunds, and gateway callbacks
│   └── notification-service/  # Email/SMS notifications
└── README.md
```

Backend services are organized under `Backend`; their local container setup is
in `Backend/docker-compose.yml`.

## Razorpay Checkout

UPI and card checkout use Razorpay Orders and Standard Checkout. Payment
signatures are verified by the backend, and payment status is confirmed with
Razorpay and synced to the order. Cash on delivery does not open Razorpay.

Copy `Backend/.env.example` to `Backend/.env`, add Razorpay test keys and a
webhook secret, then start the services from `Backend` with
`docker compose up --build`. Setup, routes, and webhook instructions are in the
[payment service guide](Backend/payment-service/README.md).

## Technology Stack

- Node.js
- Express.js
- MongoDB with Mongoose
- REST APIs
- Git and GitHub

## Security Notes

The browser uses an HTTP-only authentication cookie; backend services validate sessions and permissions. The payment service does not receive or store card numbers. A real payment provider should process payment details and notify SmartCart through a signed webhook. Keep `.env` files out of version control and never commit database URLs, API keys, or webhook secrets.

## Admin operations and current limits

The admin area is available at `/admin` after signing in with a provisioned staff account. Promotion eligibility and order totals are recalculated by Order Service from current product prices. Product reviews can only be submitted by customers with a delivered purchase and remain hidden until moderation. Reports use paid order data; net sales subtract recorded discounts and full refunds.

Store name and logo settings are reflected in the storefront, and the return policy appears in the footer. Tax and shipping settings are included in server-calculated checkout quotes and saved order totals; low-stock settings affect inventory reporting. The selected currency must match `PAYMENT_CURRENCY` configured for the payment provider, and storefront prices use that currency. Product/inventory, customer, order, and payment/refund CSV exports are available to authorized staff and are audited. Notification preferences suppress configured order, shipment, and return/refund updates while payment and security messages continue; promotion defaults prefill coupon creation and are validated by Order Service. Refunds are full-order only and carrier tracking is manual. Razorpay checkout currency is controlled by service configuration.

The first Super Admin must be created through the configured bootstrap command documented in [Auth Service setup](Backend/auth-service/README.md). No default administrator account is shipped.
