# Software Engineering Lab — Experiment No. 1
## Preparation of Software Requirements Specification (SRS)
### SmartCart Distributed E-Commerce Platform

---

### Student & Project Credentials

| Attribute | Details |
| :--- | :--- |
| **Student Name** | Ayush Dubey (TeamID 03) |
| **Roll No. / Role** | Group 03 Engineering Lead |
| **Class / Section** | B.Tech CSE – Web Services / Software Engineering Lab |
| **Date of Submission** | October 16, 2026 |
| **Project Name** | SmartCart Distributed E-Commerce Platform |
| **Target Repository** | [https://github.com/Ayush17314/SmartCart](https://github.com/Ayush17314/SmartCart) |
| **Specification Standard** | ISO/IEC/IEEE 29148:2018 & IEEE Std 830-1998 |

---

## 1. Aim
To formulate and document a formal **Software Requirements Specification (SRS)** for the **SmartCart Distributed E-Commerce Platform** in accordance with international software engineering standards (**IEEE Std 830-1998** and **ISO/IEC/IEEE 29148:2018**). The objective is to define the functional boundaries, quality attributes (non-functional requirements), business constraints, external system interfaces, and verification criteria for a polyglot microservices-based online retail architecture prior to design and system implementation.

---

## 2. Problem Statement
Modern enterprise retail platforms encounter acute operational challenges when engineered as monolithic applications. Common bottlenecks include single points of failure, uncoordinated database transactions across billing and inventory, client-side pricing vulnerabilities, unverified third-party payment callbacks, and cascading service outages under peak traffic loads. Furthermore, traditional systems lack standardized error protocols, verifiable idempotency controls against accidental double-charges, and auditable inventory adjustments.

To address these critical deficiencies, this project conceives and specifies **SmartCart**: a distributed, Amazon-inspired e-commerce platform built upon an autonomous microservices architecture (**Node.js, Express, MongoDB, MySQL, and Next.js 15**). The system decouples core business contexts—Identity & Auth, Product Catalog, Shopping Cart, Wishlist, Order Orchestration, Payment Reconciliation, and Transactional Notifications—orchestrated through a centralized API Gateway that guarantees HTTP/REST resilience, cryptographic payment verification, atomic stock reservation sagas with compensatory rollbacks, and uniform RFC 7807 Problem Details error semantics.

---

## 3. Software Requirements Specification (SRS)

### 3.1 Purpose
The purpose of this Software Requirements Specification is to establish the authoritative engineering contract for the SmartCart Distributed E-Commerce Platform. Authored strictly during the pre-implementation **Requirements Engineering Phase** of the Software Development Life Cycle (SDLC), this document serves to:
1. **Domain Isolation:** Define clear architectural boundaries, domain responsibilities, and data ownership models across all 8 microservices.
2. **Behavioral Contract:** Establish rigorous functional behavior for customer ordering, administrative governance, and third-party partner integrations (Razorpay Payment Gateway, Resend Mailer).
3. **Quality Baseline:** Enforce non-functional standards governing cryptographic security, sub-15ms edge routing latency, fault-tolerant circuit breaking, and optimistic concurrency.
4. **Verification Benchmark:** Provide an unambiguous, verifiable baseline against which test engineers validate acceptance criteria and academic evaluators assess milestone deliverables.

### 3.2 Scope
The SmartCart system encompasses the end-to-end e-commerce transactional lifecycle through seven specialized domain contexts:
- **Identity & Access Governance (Auth Service):** Multi-portal authentication (Customer, Staff, Super Admin), bcrypt credential hashing, role-based access control (RBAC), token versioning for instant session revocation, and 2-step verification challenge codes for administrative operations.
- **Product Catalog & Inventory (Product Service):** Full-text keyword searching, multi-faceted filtering (categories, brands, price bounds), dual cursor/offset pagination, dynamic HTTP ETag generation (304 Not Modified), optimistic concurrency (`If-Match` / `412`), and auditable stock adjustment logs.
- **Shopping Cart & Wishlist Management (Cart & Wishlist Services):** Persistent customer cart synchronization across devices, line-item quantity limits, and server-authoritative price calculation eliminating client-side tampering.
- **Order Orchestration Saga (Order Service):** Multi-service checkout coordination (`placeOrder`) with atomic stock reservation, coupon promotion validation, and compensatory rollback on downstream failure.
- **Payment & Financial Reconciliation (Payment Service):** Multi-channel billing supporting Razorpay Orders (UPI, Credit/Debit cards in Paise), offline Cash on Delivery (COD), cryptographic HMAC-SHA256 signature verification, asynchronous webhook reconciliation, and automated refunds.
- **Communications & Event Dispatch (Notification Service):** Automated dispatch of transactional email notifications for account verification, password resets, order confirmations, shipping tracking links, and refund notices.
- **Edge Resilience & Reverse Proxy (API Gateway):** Sliding-window rate limiting (`429`), durable MySQL idempotency key tracking, circuit breaker tripping, schema validation (AJV), and standardized RFC 7807 Problem Details error handling.

### 3.3 Stakeholders / User Classes

| S. No. | Stakeholder / User | Role & System Responsibilities |
| :---: | :--- | :--- |
| **1** | **Store Customer** (`customer`) | Browses catalog; manages cart and wishlist; places orders; executes digital payments via Razorpay (UPI/Card) or selects COD; tracks shipment lifecycle; submits product reviews; initiates return requests within 30 days of delivery. |
| **2** | **Customer Support** (`support`) | Staff persona with read-only access to customer orders and profile records; evaluates customer return claims; approves or rejects return requests with mandatory written justification; queues refund authorizations. |
| **3** | **Inventory Staff** (`inventory_staff`) | Operational staff managing catalog listings; updates stock levels; reviews low-stock thresholds; supplies mandatory audit explanation strings (`stockAdjustmentReason` $\ge$ 3 chars) recorded immutably in `stockHistory[]`. |
| **4** | **Store Admin** (`admin`) | Administrative persona governing order fulfillment states (`CONFIRMED` $\rightarrow$ `SHIPPED` $\rightarrow$ `DELIVERED`); assigns courier tracking numbers; creates/manages discount coupons; moderates customer product reviews. |
| **5** | **Super Admin** (`super_admin`) | Platform governance owner holding wildcard (`*`) privileges; completes 2-step OTP challenge; issues staff invitations; authorizes financial refunds via Razorpay API; configures storewide taxes and shipping fees. |

### 3.4 Assumptions
1. **External Cloud Services & High Availability:** The platform assumes constant outbound HTTPS connectivity to third-party partner APIs including Razorpay Payment Gateway (`https://api.razorpay.com/v1`) and Resend Transactional Email API (`https://api.resend.com/emails`). In offline testing or sandbox development environments, the Notification Service safely assumes fallback to structured mock stdout console logging without blocking execution.
2. **Private Container Network Isolation:** All backend microservices execute within an isolated internal Docker bridge network (`smartcart-network`) resolving internal hostnames via DNS (e.g., `http://auth-service:4001`). Microservices are strictly inaccessible from the public Internet; all external client traffic must traverse the API Gateway (Port 4000) or Next.js BFF (Port 3000).
3. **Standard HTTP/1.1 Semantic Compliance:** Client applications (browsers and automated API clients) are assumed to comply with modern HTTP/1.1 standards, including support for HttpOnly/SameSite cookies, ETag caching validation (`If-None-Match`), optimistic concurrency locking (`If-Match`), and client-generated UUID idempotency keys.

---

## 4. Functional Requirements
The following functional requirements specify the binding behavioral capabilities of the SmartCart platform. Each requirement is authored as an unambiguous, testable statement using normative RFC 2119 terminology:

| ID | Functional Requirement Statement | Priority |
| :---: | :--- | :---: |
| **FR-01** | The system shall authenticate users using bcrypt-hashed passwords ($\ge 10$ salt rounds) and issue cryptographically signed JWT tokens managed securely via HttpOnly, SameSite=Lax session cookies through the Next.js Backend-for-Frontend (BFF). | **High** |
| **FR-02** | The system shall provide full-text product search, category and brand filtering, dual pagination (cursor and offset), and dynamic HTTP ETag generation returning HTTP 304 Not Modified with zero body bytes for unmodified catalog items. | **High** |
| **FR-03** | The system shall maintain persistent server-side shopping carts and wishlists, recalculating item subtotals and grand totals server-authoritatively to prevent client-side price manipulation. | **High** |
| **FR-04** | The system shall orchestrate a distributed checkout saga (`placeOrder`) that atomically verifies cart items, reserves inventory, evaluates coupon discounts, and executes compensatory stock rollbacks if payment initialization fails. | **High** |
| **FR-05** | The system shall process digital online payments via Razorpay in Rupee subunits (Paise), cryptographically verifying transactions using HMAC-SHA256 signatures before transitioning order status to `CONFIRMED`. | **High** |
| **FR-06** | The system shall enforce an acyclic order state machine (`PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `SHIPPED` $\rightarrow$ `DELIVERED`), rejecting illegal transitions with HTTP 409 Conflict, and permitting customer return requests strictly within 30 days of delivery. | **Medium** |
| **FR-07** | The system shall enforce durable idempotency at the API Gateway using MySQL-persisted `Idempotency-Key` tracking, preventing duplicate orders, double billing, and redundant stock reservations on network retries. | **High** |
| **FR-08** | The system shall automatically dispatch transactional email notifications for account verification, password resets, Super Admin 2-step OTP challenges, order receipts, shipping dispatches, and refund confirmations. | **Medium** |

---

## 5. Non-Functional Requirements
The platform's quality attributes, resilience standards, and operational performance benchmarks are specified across five core non-functional categories:

| ID | Category | Non-Functional Requirement Specification |
| :---: | :--- | :--- |
| **NFR-01** | **Performance** | The API Gateway reverse-proxy overhead shall not exceed 15ms at the 95th percentile under standard load. Unmodified catalog resources requested with matching `If-None-Match` headers shall return HTTP 304 Not Modified with a 0-byte payload to conserve edge bandwidth. |
| **NFR-02** | **Security** | All stored passwords must be hashed using bcrypt with $\ge 10$ salt rounds. Session tokens must be stored exclusively in HttpOnly, SameSite=Lax cookies. Cross-service secret exchanges must utilize constant-time comparison (`crypto.timingSafeEqual`) to eliminate timing attack vectors. |
| **NFR-03** | **Usability** | The storefront and administrative portals shall be fully responsive across mobile ($\le 640\text{px}$), tablet ($768\text{px} - 1024\text{px}$), and desktop ($\ge 1280\text{px}$) viewports with WCAG 2.1 Level AA compliance, featuring shimmer skeleton loaders and optimistic UI state updates. |
| **NFR-04** | **Reliability / Backup** | The API Gateway shall trip an automated circuit breaker to OPEN state if an upstream service registers 5 consecutive faults within 15 seconds, failing fast with HTTP 503 and `Retry-After: 15`. Automated database backups must execute daily across MySQL and MongoDB instances. |
| **NFR-05** | **Observability** | The API Gateway shall generate a unique UUID v4 and inject it as header `X-Request-Id` into every proxied request. All downstream microservices must propagate this header and include it in structured, single-line JSON log entries for distributed tracing. |

---

## 6. Constraints / Business Rules

| ID | Constraint / Business Rule Statement |
| :---: | :--- |
| **BR-01** | **Microservice Database Isolation Constraint:** Each microservice must strictly own its dedicated persistence database (MySQL for API Gateway idempotency and audit; MongoDB for Auth, Product, Cart, Wishlist, Order, Payment, and Notification). Cross-service database queries, joins, and shared models are strictly prohibited. |
| **BR-02** | **Server-Authoritative Pricing Rule:** Line-item product subtotals, tax quotes, shipping fees, and grand totals must be calculated exclusively on the server side using canonical database values. Any price, tax, or discount fields submitted in client payloads must be rejected or discarded. |
| **BR-03** | **30-Day Delivery Return Window Policy:** A customer may only initiate a product return request if the order status is `DELIVERED` and the elapsed time since delivery is less than or equal to 30 calendar days. Return requests submitted beyond 30 days must be rejected automatically with HTTP 422. |
| **BR-04** | **Audited Inventory Adjustment Rule:** Every manual or administrative modification of product stock levels must include an authenticated staff `actorUserId` and a mandatory justification string (`stockAdjustmentReason` $\ge 3$ characters) recorded immutably in the `stockHistory[]` collection. |

---

## 7. External Interface Requirements

### 7.1 User Interface
The SmartCart system provides five specialized, responsive web interfaces engineered with **Next.js 15, Tailwind CSS, and TanStack Query**:
1. **Storefront Catalog & Product Details Interface:** Provides full-text keyword search with live debouncing, dynamic category drawers, faceted brand/price filters, responsive product grid with stock status badges, and quick-view detail modals.
2. **Shopping Cart Drawer & Checkout Screen:** Interactive slide-over cart drawer with real-time quantity steppers, server-side coupon code redemption bar, multi-step shipping address form, payment method selector (Razorpay UPI/Card vs. COD), and live order quote.
3. **Customer Account & Order Tracking Portal:** Authenticated customer dashboard displaying historical orders, visual shipment tracking stepper (`Confirmed` $\rightarrow$ `Shipped` $\rightarrow$ `Delivered`) with carrier links, and 30-day return claim submission modal.
4. **Staff Operations & Inventory Management Workbench:** Dedicated workbench for support and inventory personnel; features an inline inventory modifier with mandatory adjustment reason modal, low-stock threshold alerts, order dispatch controls, and return claim review workflow.
5. **Super Admin Governance Console:** Administrative portal requiring 2-step OTP verification; features staff account onboarding and invitation link generation, storewide tax and shipping fee configuration, review moderation workbench, and payment refund authorization console.

### 7.2 Input Requirements

| S. No. | Input Entity | Input Description & Format |
| :---: | :--- | :--- |
| **1** | **User Registration & Login Credentials** | Customer full name, unique email address, password (minimum 8 characters with alphanumeric and special character constraints), and optional telephone number. |
| **2** | **Product Catalog & Inventory Data** | Product title, category slug, brand identifier, rich description, positive price float, initial stock integer, image asset URLs, and mandatory stock adjustment audit justification text. |
| **3** | **Checkout Shipping & Delivery Data** | Recipient name, street address, city, state, postal code, phone number, coupon code string, and selected payment method enum (`'UPI'`, `'CARD'`, `'COD'`). |
| **4** | **Payment Gateway Verification Payloads** | Razorpay order ID (`order_xxx`), Razorpay payment ID (`pay_xxx`), and cryptographic HMAC signature string generated upon transaction completion. |

### 7.3 Output Requirements

| S. No. | Output Entity | Output Description & Format |
| :---: | :--- | :--- |
| **1** | **Dynamic Product Catalog Feed** | JSON product collections supporting cursor-based pagination metadata, computed customer rating averages, active promotional discounts, and RFC 5988 `Link` headers. |
| **2** | **Order Confirmation & Invoice Receipt** | Itemized order confirmation document detailing unique order ID, line items, server-calculated taxes, shipping surcharges, net discount, grand total, and delivery tracking status. |
| **3** | **Transactional Email Notifications** | Responsive HTML email templates dispatched for account verification, password reset links, Super Admin 2-step OTP challenge codes, order confirmation receipts, shipment dispatches, and refund status updates. |
| **4** | **RFC 7807 Standardized Problem Details** | Structured error payloads (`application/problem+json`) containing type URI, HTTP status code, title, detailed explanation, correlation instance UUID, and validation error arrays. |

---

## 8. Requirement Review

**1. Are all requirements clear and understandable?**  
Yes. All functional and non-functional requirements are specified unambiguously using formal RFC 2119 normative keywords ("SHALL", "MUST", "SHOULD"). Each requirement specifies explicit input preconditions, internal state transformations, and output postconditions. Domain boundaries between the eight microservices are cleanly demarcated with dedicated database ownership, eliminating ambiguity regarding data custody and responsibility.

**2. Are any requirements contradictory?**  
No. The specification has been systematically verified to ensure zero logical or architectural contradictions. In particular:
- Server-side price authority completely supersedes client-submitted values, eliminating price discrepancies.
- The order lifecycle state machine follows a strictly acyclic, deterministic sequence (`PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `SHIPPED` $\rightarrow$ `DELIVERED`), preventing contradictory state transitions.
- Database isolation rules prohibit cross-service shared schemas, preventing distributed deadlocks and race conditions.

**3. Are the requirements testable? Give one example.**  
Yes. Every requirement in this specification is designed to be verifiable through automated unit tests, integration test suites, or formal inspection.  
*Example:* Requirement **FR-05 (Payment Signature Verification)** is testable through deterministic assertions:
$$\text{Expected Signature} = \text{HMAC-SHA256}(\text{order\_id} + "|" + \text{payment\_id}, \text{RAZORPAY\_KEY\_SECRET})$$
Submitting a payload with a valid cryptographic signature asserts an HTTP 200 OK response and transitions payment status to `SUCCESS`. Conversely, altering a single character of the signature asserts an HTTP 400 Bad Request with Problem Details error `urn:smartcart:error:payment-declined`, setting payment status to `FAILED` and triggering a compensatory inventory release in the Order Service.

---

## 9. Result
In this experiment, a comprehensive Software Requirements Specification (SRS) for the SmartCart Distributed E-Commerce Platform was successfully formulated and structured in accordance with **IEEE Std 830-1998** and **ISO/IEC/IEEE 29148:2018** standards. The functional requirements across eight microservices, non-functional quality attributes, business constraints, external system interfaces, and verification review criteria were rigorously defined, establishing an authoritative engineering baseline prior to system design and implementation.

---

## Appendix: System Architecture & Data Model Reference

### Microservice Topology & Port Allocation

| Microservice Component | Port | Runtime Stack | Persistence Store | Domain Responsibility |
| :--- | :---: | :--- | :--- | :--- |
| **Storefront & Admin Web App** | `3000` | Next.js 15, React 19 | HttpOnly Cookie / Session | Storefront UI, Staff Portals, BFF |
| **API Gateway Service** | `4000` | Express, Helmet, AJV | MySQL (`smartcart`) | Edge Proxy, Rate Limit, Idempotency |
| **Auth & Identity Service** | `4001` | Express, Mongoose | MongoDB (`smartcart_auth`) | User Accounts, RBAC, Staff Invites |
| **Product Catalog Service** | `4002` | Express, Mongoose | MongoDB (`smartcart_products`) | Catalog Search, Stock History, Reviews |
| **Shopping Cart Service** | `4003` | Express, Mongoose | MongoDB (`smartcart_cart`) | User Cart Persistence, Subtotals |
| **Wishlist Service** | `4004` | Express, Mongoose | MongoDB (`smartcart_wishlist`) | Saved Items, Move-to-Cart Flow |
| **Order Orchestration Service** | `4005` | Express, Mongoose | MongoDB (`smartcart_orders`) | Checkout Saga, State Machine, Coupons |
| **Payment Reconciliation Service** | `4006` | Express, Mongoose | MongoDB (`smartcart_payments`) | Razorpay API, Webhooks, Refunds |
| **Notification Dispatch Service** | `4007` | Express, Mongoose | MongoDB (`smartcart_notifications`) | Transactional Emails, Mock Fallback |
| **Central Relational Database** | `3306` | MySQL 8.4 Server | InnoDB Engine | Idempotency Records & Request Audit |
