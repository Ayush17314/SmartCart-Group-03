# INDIAN INSTITUTE OF INFORMATION TECHNOLOGY VADODARA
## CS545 — SOFTWARE ENGINEERING PROJECT REPORT
### Master of Computer Applications (MCA) — Second Year
**Academic Term:** Autumn 2026-27

---

### Project Metadata
- **Project Title:** SmartCart Distributed E-Commerce Platform
- **Group No.:** Group 03 (TeamID 03)
- **Submitted By:** Ayush Dubey (Enrollment ID: ________________)
- **Submitted To:** Course Coordinator, Department of Computer Science & Engineering, IIIT Vadodara
- **GitHub Repository:** [https://github.com/Ayush17314/SmartCart](https://github.com/Ayush17314/SmartCart)
- **Deliverables Drive:** [https://drive.google.com/drive/folders/1q9IY8r2_aUCeogiUsT0tpODwt3hF6PHL?usp=sharing](https://drive.google.com/drive/folders/1q9IY8r2_aUCeogiUsT0tpODwt3hF6PHL?usp=sharing)

---

## CERTIFICATE

This is to certify that **Ayush Dubey**, Enrollment Number ________________, a student of the Master of Computer Applications (MCA) programme at the **Indian Institute of Information Technology Vadodara**, has completed the laboratory work for **CS545 – Software Engineering**, covering Experiments 1 to 3, during the academic year 2026-27.

The work has been submitted as part of the course requirements for the laboratory curriculum.

**Date:** __________________  
**Faculty Signature:** __________________  
**Faculty Name:** __________________  
**Department:** Department of Computer Science & Engineering, IIIT Vadodara

---

## DECLARATION

I hereby declare that the work presented in this Software Engineering Lab Report is my original work, completed as part of the **CS545 Software Engineering** course.

The diagrams, tables, analysis, and other contents have been prepared by me for the **SmartCart Distributed E-Commerce Platform**. Any external references or resources used have been appropriately acknowledged.

- **Student Name:** Ayush Dubey
- **Enrollment Number:** __________________
- **Signature:** __________________
- **Date:** __________________

---

## ACKNOWLEDGEMENT

I would like to express my sincere gratitude to our course faculty and laboratory instructors for **CS545 Software Engineering** at the **Indian Institute of Information Technology Vadodara** for their continuous support and guidance during our laboratory sessions.

Their instruction on software requirements specifications, process models, and UML behavioral modeling helped us structure the SmartCart project systematically from requirements to design.

I also thank the **Department of Computer Science & Engineering** for providing the lab facilities, and my group members for their active collaboration and discussions during the preparation of this report.

**Ayush Dubey**  
MCA Second Year, IIIT Vadodara

---

## TABLE OF CONTENTS

| Experiment No. / Section Title | Page No. |
| :--- | :---: |
| **1. Lab Experiment 1:** Software Requirements Specification (SRS) | 6 |
| **2. Lab Experiment 2:** Software Process Model Specification & Comparative Analysis | 10 |
| **3. Lab Experiment 3:** System Use Case Specification & Behavioral Modeling | 14 |
| **Conclusion** | 18 |
| **References** | 19 |

---

## LAB EXPERIMENT 1: Software Requirements Specification (SRS)

### 1. Aim
To prepare a formal Software Requirements Specification (SRS) for the **SmartCart Distributed E-Commerce Platform** in accordance with **IEEE Std 830-1998** and **ISO/IEC/IEEE 29148:2018** standards, identifying stakeholder roles, functional requirements, non-functional requirements, business constraints, external interfaces, and requirement review criteria.

### 2. Problem Statement
Traditional monolithic retail systems suffer from single points of failure, tight coupling between cart and inventory databases, client-side price tampering risks, and unverified third-party payment callbacks. High traffic during peak sales creates database deadlocks and slow checkout times.

To solve these issues, SmartCart is designed as a distributed e-commerce web platform using Node.js, Express, MongoDB, MySQL, and Next.js 15. The system separates the business domains into independent microservices—Auth, Product Catalog, Cart, Wishlist, Order Orchestration, Payment, and Notifications. An API Gateway handles client routing, request rate limiting, durable idempotency tracking, and Razorpay HMAC-SHA256 signature verification.

### 3. Software Requirements Specification (SRS)

#### 3.1 Purpose
The purpose of this SRS is to define the functional, behavioral, and quality requirements of SmartCart before writing code. It establishes a clear technical contract for our development team, covers the boundaries of all services, and sets the baseline for verification.

#### 3.2 Scope
The major functions in the scope of SmartCart include:
- **User Authentication:** User registration, bcrypt password hashing, login, and Role-Based Access Control (RBAC) for customers, support staff, inventory staff, admins, and super admins.
- **Product Catalog:** Full-text search, category and brand filters, dual cursor/offset pagination, and dynamic HTTP ETag caching (304 Not Modified).
- **Cart & Wishlist:** Server-authoritative cart subtotal calculation and wishlist move-to-cart operations.
- **Order Management:** Multi-service checkout saga with atomic stock reservation and compensatory rollbacks if payment fails.
- **Payments:** Razorpay checkout in Paise (UPI and Card payments), HMAC-SHA256 signature verification, and offline Cash on Delivery (COD).
- **Fulfillment & Returns:** Order status lifecycle (`PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `SHIPPED` $\rightarrow$ `DELIVERED`) and 30-day return evaluation.
- **Edge Resilience:** API Gateway rate limiting (120 req/60s), durable MySQL idempotency key checks, and RFC 7807 problem details error responses.

#### 3.3 Stakeholders / User Classes

| S. No. | Stakeholder / User | Role & System Responsibilities |
| :---: | :--- | :--- |
| **1** | **Store Customer** (`customer`) | Browses products, manages cart and wishlist, places orders, completes Razorpay or COD payments, tracks parcel delivery, and submits return requests within 30 days. |
| **2** | **Customer Support** (`support`) | Read-only access to customer orders and profiles; reviews return requests, approves or rejects returns with justification, and queues refund actions. |
| **3** | **Inventory Staff** (`inventory_staff`) | Manages catalog listings, updates stock counts, checks low-stock thresholds, and enters mandatory audit reasons for all stock adjustments. |
| **4** | **Store Admin** (`admin`) | Updates order fulfillment states (`CONFIRMED` $\rightarrow$ `SHIPPED` $\rightarrow$ `DELIVERED`), enters courier tracking numbers, creates discount coupons, and moderates reviews. |
| **5** | **Super Admin** (`super_admin`) | Platform owner with full system permissions (`*`); completes 2-step OTP verification, invites staff, authorizes refunds via Razorpay API, and sets storewide tax/shipping rates. |

#### 3.4 Assumptions
1. **External Cloud Availability:** The system assumes continuous connectivity to Razorpay Payment Gateway and Resend Email APIs, with fallback to structured console logging during offline testing.
2. **Containerized Network:** Backend services run inside a private Docker bridge network, accessible only through the API Gateway (Port 4000) or Next.js BFF (Port 3000).
3. **HTTP/1.1 Compliance:** Web clients support modern HTTP standards including HttpOnly cookies, dynamic ETag validation (`If-None-Match`), and `Idempotency-Key` headers.

### 4. Functional Requirements

| ID | Functional Requirement Statement | Priority |
| :---: | :--- | :---: |
| **FR-01** | The system shall authenticate users using bcrypt-hashed passwords ($\ge 10$ salt rounds) and issue signed JWT tokens stored in HttpOnly, SameSite=Lax cookies. | **High** |
| **FR-02** | The system shall provide product keyword searching, category filters, cursor pagination, and dynamic HTTP ETags returning 304 Not Modified for unchanged data. | **High** |
| **FR-03** | The system shall maintain persistent server-side shopping carts and recalculate item subtotals on the server to prevent client-side price modification. | **High** |
| **FR-04** | The system shall orchestrate a distributed checkout saga (`placeOrder`) that reserves stock, applies valid coupons, and releases stock if payment fails. | **High** |
| **FR-05** | The system shall process digital online payments via Razorpay in Paise and verify HMAC-SHA256 signatures before confirming orders. | **High** |
| **FR-06** | The system shall enforce an order lifecycle (`PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `SHIPPED` $\rightarrow$ `DELIVERED`) and allow return requests within 30 days of delivery. | **Medium** |
| **FR-07** | The system shall enforce durable idempotency at the API Gateway using MySQL to prevent duplicate charges or orders during network retries. | **High** |
| **FR-08** | The system shall send transactional emails for account verification, password resets, Super Admin OTP logins, order invoices, and shipping alerts. | **Medium** |

### 5. Non-Functional Requirements

| ID | Category | Non-Functional Requirement |
| :---: | :--- | :--- |
| **NFR-01** | **Performance** | The API Gateway reverse-proxy overhead shall be under 15ms at the 95th percentile. Catalog queries with matching `If-None-Match` headers shall return HTTP 304 with 0-byte payload. |
| **NFR-02** | **Security** | Passwords must be hashed with bcrypt ($\ge 10$ rounds). Session tokens must be stored in HttpOnly cookies. Cross-service secret checks must use constant-time comparison. |
| **NFR-03** | **Usability** | The user interface must be responsive across mobile ($\le 640\text{px}$), tablet, and desktop ($\ge 1280\text{px}$) viewports with skeleton loaders to prevent layout shifts. |
| **NFR-04** | **Reliability / Backup** | The API Gateway circuit breaker shall open after 5 consecutive service failures within 15 seconds, returning HTTP 503 with `Retry-After: 15`. Daily backups shall run for all databases. |

### 6. Constraints / Business Rules

| ID | Constraint / Business Rule |
| :---: | :--- |
| **BR-01** | **Database Isolation Constraint:** Each microservice must own its database exclusively (MySQL for Gateway; MongoDB for Auth, Product, Cart, Order, Payment, Notification). Direct cross-database joins are prohibited. |
| **BR-02** | **Server-Side Pricing Rule:** Line item subtotals, taxes, shipping fees, and order totals must be calculated by backend services. Submitted client prices are ignored. |
| **BR-03** | **30-Day Return Policy:** A customer can only initiate a return if the order status is `DELIVERED` and within 30 days of delivery. Older orders cannot be returned. |
| **BR-04** | **Audited Inventory Rule:** Every manual stock adjustment must include the staff `userId` and a mandatory reason string ($\ge 3$ characters) recorded in the `stockHistory` collection. |

### 7. External Interface Requirements

#### 7.1 User Interface
The system includes five main user interface modules built with Next.js 15:
1. **Storefront Catalog Screen:** Search bar, category drawer, brand/price filters, and product grid with star ratings.
2. **Cart & Checkout Screen:** Slide-over drawer with quantity controls, coupon input, shipping address form, and payment method selector.
3. **Customer Dashboard:** Order tracking timeline (`Confirmed` $\rightarrow$ `Shipped` $\rightarrow$ `Delivered`) with carrier links and return button.
4. **Staff Workbench:** Stock modification table with mandatory reason popup, low-stock alerts, and return evaluation workbench.
5. **Super Admin Console:** 2-step verification login, staff invitation generator, store configuration, and refund processing.

#### 7.2 Input Requirements

| S. No. | Input | Description |
| :---: | :--- | :--- |
| **1** | **User Credentials** | Customer name, unique email address, password (minimum 8 characters), and phone number. |
| **2** | **Product & Stock Details** | Title, category, brand, description, price, stock quantity, images, and stock change reason. |
| **3** | **Checkout & Shipping Data** | Recipient name, full street address, city, state, postal code, coupon code, and payment method (UPI, Card, COD). |
| **4** | **Payment Gateway Payloads** | Razorpay order ID, payment ID, and cryptographic HMAC signature received from checkout. |

#### 7.3 Output Requirements

| S. No. | Output | Description |
| :---: | :--- | :--- |
| **1** | **Product Catalog Feed** | JSON product listings with cursor pagination links, star ratings, and real-time stock status. |
| **2** | **Order Receipt & Invoice** | Itemized order confirmation showing line items, discounts, shipping fees, taxes, and grand total. |
| **3** | **Transactional Emails** | Automated emails for account signup, password resets, Super Admin OTPs, order confirmation, and shipping updates. |
| **4** | **Problem Details Errors** | Standardized RFC 7807 JSON error responses with type URI, status code, title, and validation error arrays. |

### 8. Requirement Review
1. **Are all requirements clear and understandable?**  
   Yes. All requirements are written clearly using standard RFC 2119 keywords ("shall", "must"). Each requirement specifies explicit inputs, expected system behavior, and outputs without vague terminology.
2. **Are any requirements contradictory?**  
   No. The requirements have been checked to ensure consistency. Price calculations are strictly server-authoritative, order lifecycle transitions follow a clear non-reversible sequence, and each database is owned by one service only.
3. **Are the requirements testable? Give one example.**  
   Yes. Every requirement can be verified with automated test suites. For example, FR-05 (Payment Signature Verification) is testable: generating a valid HMAC-SHA256 signature asserts HTTP 200 OK and payment status `SUCCESS`. Sending an altered signature string returns HTTP 400 Bad Request with an error code and marks payment `FAILED`.

### 9. Result
In this experiment, a complete Software Requirements Specification (SRS) for the SmartCart Distributed E-Commerce Platform was formulated following IEEE Std 830-1998 guidelines. The functional requirements, non-functional quality attributes, business constraints, external interfaces, and verification review were systematically documented.

---

## LAB EXPERIMENT 2: Software Process Model Specification & Comparative Analysis

### 1. Aim & Objectives
To compare and evaluate primary software development life cycle (SDLC) process models—Waterfall, Incremental, Prototyping, Spiral, and Agile (Scrum)—against the engineering needs of the SmartCart e-commerce platform, and to justify why an Agile-Incremental Hybrid Model is the most effective approach for a distributed microservices architecture.

### 2. Problem Statement & Engineering Context
Selecting an SDLC model directly affects delivery predictability, technical risk management, and overall software quality. SmartCart consists of eight decoupled services, multiple databases, and external cloud integrations (Razorpay and Resend). Choosing a model that requires frozen requirements upfront or delays testing until the end increases the risk of integration failure.

### 3. Comparative Evaluation of Process Models

| Factor | Waterfall | Incremental | Prototype | Spiral | Agile (Scrum) |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Requirements** | Stable / Frozen | Partly Stable | Unclear / Fluid | Can Change | Changing / Stories |
| **Early Delivery** | Low (End only) | Yes (Staged) | Sample Mockups | Possible | Yes (Sprint end) |
| **Customer Feedback** | Low / Post-test | Medium / Staged | High / UI Focus | High / Quadrants | Very High / Continuous |
| **Risk Handling** | Low (Late disc.) | Medium-High | Medium (UI only) | Very High (Formal) | Medium (Automated) |
| **Microservice Fit** | Poor (Monolithic) | Excellent (Staged) | Fair (Disposable) | Moderate | Excellent (CI/CD) |
| **Cost of Change** | Very High | Low-Medium | Moderate | Medium | Low |

### 4. Analysis of Models & Why Agile-Incremental Model Was Chosen
- **Why Waterfall Fails:** Waiting until all eight microservices are coded before testing creates a "big bang" integration disaster. Late discovery of database transaction bugs or webhook errors causes massive delays.
- **Why Prototyping Is Incomplete:** Disposable mockups help design user interfaces, but an e-commerce backend requires production-grade ACID database tables, circuit breakers, and HMAC signature validation from day one.
- **Why Spiral Has High Overhead:** Designed for ultra-high-budget aerospace and defense systems. Its heavy risk-governance documentation and cost-benefit calculations create excessive overhead for web applications.
- **Why Pure Agile Needs Upfront Structure:** Pure Agile works well for customer-facing features, but can neglect upfront architectural planning (port allocations, protocol standards, schema boundaries), leading to messy inter-service dependencies.
- **The Optimal Choice — Agile-Incremental Hybrid:** Combines upfront architectural stability with iterative sprint releases. Microservices are built, integrated, and verified service-by-service across six clear increments.

### 5. SmartCart Phased Delivery Roadmap
- **Increment 1 (Foundations):** Raw HTTP server setup, API Gateway routing skeleton, and environment variable isolation.
- **Increment 2 (Domain Services & Saga):** Auth, Product Catalog, Cart, and Order Orchestration services with isolated database schemas.
- **Increment 3 (External Partner Edge):** Razorpay payment gateway, HMAC signature validation, webhook handlers, and transactional email notifications.
- **Increment 4 (Resilience & REST):** Plural REST endpoints, OpenAPI 3.0 documentation, durable MySQL idempotency, and circuit breakers.
- **Increment 5 (Advanced HTTP Semantics):** Dynamic ETags (304), optimistic concurrency (`If-Match` / `412`), content negotiation, and rate limiting (`429`).
- **Increment 6 (Error Standardization):** Uniform RFC 7807 Problem Details error formatting across all services, multi-field validation arrays, and testing.

### 6. Case Analyses: Real-World Scenarios in SmartCart
- **Case 1: Microservice Decomposition:** Building services incrementally allowed us to test Auth and Product services independently before writing the Order checkout saga that calls both.
- **Case 2: Payment Partner Risk:** Razorpay integration was isolated into Increment 3. We built both online Razorpay payment and offline COD, allowing testing without incurring financial gateway fees.
- **Case 3: Decoupled Frontend Development:** Using OpenAPI schemas and mock endpoints, our frontend team built the Next.js 15 UI in parallel with backend service development.

### 7. Result & Conclusion
The Agile-Incremental Hybrid Model provided the architectural discipline needed for microservices while giving our team the flexibility to deliver working software early and manage external partner risks. It proved to be the most practical and effective model for SmartCart.

---

## LAB EXPERIMENT 3: System Use Case Specification & Behavioral Modeling

### 1. Aim & Objectives
To model the functional behavior of the SmartCart E-Commerce Platform using OMG UML 2.5 Use Case Diagrams and specifications. The objective is to define the system boundary, identify user and external system actors, organize use cases into functional blocks, analyze «include» and «extend» relationships, and detail step-by-step event flows.

### 2. Actor Profiles
1. **Customer:** Storefront end-user who searches products, manages cart items, places orders, makes digital/COD payments, tracks shipments, and submits reviews.
2. **Admin:** Internal store operator who manages product listings, adjusts inventory stock with audit notes, updates order delivery statuses, and manages coupons.
3. **Payment Gateway («System Actor»):** External cloud payment network communicating over HTTPS to authorize digital payments (UPI/Card), verify HMAC signatures, and dispatch webhooks.

### 3. Functional Blocks & Subsystem Breakdown

#### 3.1 Shared Use Cases
- `Login & Authenticate`: Verifies email and password using bcrypt; issues role-scoped JWT session token.
- `Register Account`: Onboards new shoppers with contact info, shipping address, and encrypted credentials.
- `Search Catalog`: Keyword search with category filters and price sorting to locate merchandise.
- `View Product Details`: Displays product descriptions, prices, real-time stock levels, and customer reviews.

#### 3.2 Customer Use Cases
- `Manage Cart`: Adds products, modifies quantities, and recalculates server-side subtotals.
- `Place Order (Checkout)`: Coordinates checkout saga: reserves stock, evaluates promo codes, and initiates billing (`«include» Check Stock`, `«include» Make Payment`, `«extend» Apply Coupon`).
- `Check Stock`: Mandatory inventory check locking required product quantities during checkout.
- `Apply Coupon`: Optional discount calculation executed when a valid coupon code is entered.
- `Make Payment`: Executes payment via Razorpay (UPI/Card) or registers Cash on Delivery (COD).
- `Track Order`: Displays shipping milestones (`PENDING` $\rightarrow$ `CONFIRMED` $\rightarrow$ `SHIPPED` $\rightarrow$ `DELIVERED`).
- `Cancel Order`: Conditionally allows cancellation and refunds if order has not yet been dispatched.
- `Submit Review`: Enables verified buyers of delivered products to submit star ratings and feedback.

#### 3.3 Admin Use Cases
- `Manage Products & Stock`: CRUD operations on catalog items and stock counts with mandatory audit notes.
- `Manage Orders & Dispatch`: Inspects orders, updates fulfillment statuses, and enters courier tracking numbers.
- `Manage Coupons`: Creates percentage/fixed discount promotions with minimum spend and expiry dates.
- `View Analytics`: Displays sales revenue dashboards, total order count, and low-stock alerts.

### 4. Relationship Analysis: «include» vs. «extend»
- **«include» Relationship (Mandatory):** An unconditional sub-process without which the base use case cannot complete. In SmartCart, `Place Order` unconditionally includes `Check Stock` (cannot sell unavailable stock) and `Make Payment` (order requires financial settlement). The dashed arrow points from Base Use Case to Included Use Case.
- **«extend» Relationship (Optional / Conditional):** An optional branch that runs only under specific conditions at designated Extension Points. In SmartCart, `Apply Coupon` extends `Place Order` (runs only if customer enters a promo code), and `Cancel Order` extends `Track Order` (runs only if order is in pre-dispatch status). The dashed arrow points from Extending Use Case to Base Use Case.

### 5. Tabular Use Case Specification: UC-01 Place Order
- **Primary Actor:** Customer | **Secondary Actor:** Payment Gateway («System Actor»)
- **Preconditions:** Authenticated customer, active items in shopping cart, delivery address confirmed.
- **Postconditions:** Order created in `PENDING` status, stock reserved, payment initialized, cart cleared.

| Step | Participant | Action / System Event |
| :---: | :--- | :--- |
| **1** | Customer | Navigates to checkout, confirms shipping address, and selects payment method. |
| **2** | System | `«include» Check Stock`: Verifies warehouse stock in Product Service and locks quantities. |
| **3** | Customer / System | `«extend» Apply Coupon`: If promo code supplied, checks validity and deducts discount. |
| **4** | System | Calculates shipping fees, applicable taxes, and final order total. |
| **5** | System | `«include» Make Payment`: Creates Razorpay payment intent in Paise or registers COD. |
| **6** | System | Clears cart, assigns `PENDING` status, returns HTTP 201 Created, and displays receipt. |

### 6. Microservices Traceability Matrix

| Use Case | Microservice Subsystem | Port | Primary REST Endpoint |
| :--- | :--- | :---: | :--- |
| **Login & Register** | Auth Service | 4001 | `POST /api/auth/customer-login`<br>`POST /api/auth/register` |
| **Catalog & Stock** | Product Service | 4002 | `GET /api/products`<br>`PATCH /api/products/:id/stock` |
| **Cart Management** | Cart Service | 4003 | `GET /api/cart`<br>`POST /api/cart/items` |
| **Checkout & Tracking** | Order Service | 4005 | `POST /api/orders`<br>`GET /api/orders/:id` |
| **Payment Processing** | Payment Service | 4006 | `POST /api/payments/create`<br>`POST /api/payments/verify/:id` |
| **Notifications** | Notification Service | 4007 | `POST /api/notifications/dispatch` |

### 7. Result & Conclusion
The UML 2.5 Use Case Model established a clear behavioral specification for SmartCart. Factoring requirements into Shared, Customer, and Admin packages and declaring include/extend relationships provides our development team with clear, testable goals.

---

## OVERALL CONCLUSION

The laboratory work completed across Experiments 1 to 3 provided a comprehensive foundation in software engineering principles applied to the SmartCart Distributed E-Commerce Platform.

In Experiment 1, the Software Requirements Specification (SRS) defined the functional baseline, non-functional quality attributes, and domain boundaries across our eight microservices. It demonstrated the importance of establishing strict requirements early to prevent scope creep and eliminate ambiguities.

In Experiment 2, the comparative evaluation of software process models proved that distributed microservices benefit most from an Agile-Incremental Hybrid approach. It allowed us to establish an upfront architectural blueprint while incrementally conquering third-party integration risks (such as Razorpay payments) across six staged releases.

In Experiment 3, UML Use Case modeling established the system boundary and defined clear user interactions. Differentiating between mandatory («include») sub-processes and optional («extend») branches helped map user expectations directly to backend microservice REST endpoints.

Together, these three experiments demonstrate how structured requirements engineering, thoughtful process selection, and visual behavioral modeling set up a software project for reliable, predictable development.

---

## REFERENCES

1. ISO/IEC/IEEE 29148:2018, *"Systems and software engineering — Life cycle processes — Requirements engineering,"* IEEE, 2018.
2. IEEE Std 830-1998, *"IEEE Recommended Practice for Software Requirements Specifications,"* IEEE Computer Society, 1998.
3. Object Management Group (OMG), *"OMG Unified Modeling Language (OMG UML) Specification, Version 2.5.1,"* Dec. 2017.
4. R. S. Pressman and B. R. Maxim, *Software Engineering: A Practitioner's Approach*, 9th ed., McGraw-Hill Education, 2020.
5. I. Sommerville, *Software Engineering*, 10th ed., Pearson Education, 2016.
6. GeeksforGeeks, *"Software Engineering – Requirements Engineering and SRS Guidelines,"* [Online]. Available: `https://www.geeksforgeeks.org/software-engineering-software-requirement-specifications-srs/`
7. GeeksforGeeks, *"Unified Modeling Language (UML) – Use Case Diagrams,"* [Online]. Available: `https://www.geeksforgeeks.org/unified-modeling-language-uml-use-case-diagrams/`
8. GeeksforGeeks, *"Software Engineering – SDLC Process Models (Waterfall, Incremental, Spiral, Agile),"* [Online]. Available: `https://www.geeksforgeeks.org/software-engineering-software-development-life-cycle-sdlc/`
9. YouTube, Gate Smashers, *"Software Engineering Complete Lecture Playlist – SRS, Process Models, and UML Diagrams,"* [Online]. Available: `https://www.youtube.com/@GateSmashers`
10. YouTube, Abdul Bari, *"Software Engineering & Object-Oriented Analysis and Design (OOAD) Lecture Series,"* [Online]. Available: `https://www.youtube.com/@abdul_bari`
11. YouTube, Web Dev Simplified, *"Microservices Architecture and Razorpay Payment Gateway Integration Tutorials,"* [Online]. Available: `https://www.youtube.com/@WebDevSimplified`
12. M. Fowler, *Patterns of Enterprise Application Architecture*, Addison-Wesley, 2002.
13. M. Nottingham, E. Wilde, and S. Dalal, *RFC 7807: Problem Details for HTTP APIs*, IETF, 2016.
14. SmartCart Core Engineering Team, *"SmartCart Distributed E-Commerce Platform GitHub Repository,"* 2026. [Online]. Available: `https://github.com/Ayush17314/SmartCart`
