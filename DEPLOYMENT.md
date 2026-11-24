# 🚀 SmartCart 100% Free Cloud Deployment Guide ($0 Total Cost)

This guide walks you through deploying the complete **SmartCart** platform (Next.js 15 frontend + 8 microservices backend + MongoDB database + email notifications) completely **free of charge** ($0/month) with **no credit card required**.

---

## 🏗️ 100% Free Architecture Overview

```mermaid
flowchart LR
    subgraph Users["Clients & Browsers"]
        Browser["Customer / Admin Browser"]
    end

    subgraph Vercel["Vercel (100% Free Hobby Tier)"]
        Frontend["Next.js 15 Storefront & Portals<br/>(BFF Serverless Proxy)"]
    end

    subgraph Render["Render.com (100% Free Web Service)"]
        Gateway["API Gateway (Port 4000/PORT)<br/>Reverse Proxy & Rate Limiter"]
        Auth["auth-service (4001)"]
        Product["product-service (4002)"]
        Cart["cart-service (4003)"]
        Wishlist["wishlist-service (4004)"]
        Order["order-service (4005)"]
        Payment["payment-service (4006)"]
        Notification["notification-service (4007)"]

        Gateway --> Auth
        Gateway --> Product
        Gateway --> Cart
        Gateway --> Wishlist
        Gateway --> Order
        Gateway --> Payment
        Gateway --> Notification
    end

    subgraph CloudDB["MongoDB Atlas (Free M0 Cluster)"]
        Mongo[("MongoDB Atlas<br/>AWS Mumbai")]
    end

    subgraph SmtpCloud["SMTP Mail Server (100% Free Gmail/Brevo)"]
        Smtp["SMTP Server (Sends to ANY email)"]
    end

    Browser -->|HTTPS| Frontend
    Frontend -->|Server-to-Server API_URL| Gateway
    Auth & Product & Cart & Wishlist & Order & Payment & Notification --> Mongo
    Notification & Auth --> Smtp
```

| Component | Platform | Free Tier Inclusions | Cost |
|---|---|---|---|
| **Frontend** | [Vercel](https://vercel.com) | Unlimited builds, global Edge CDN, auto HTTPS, zero-config Next.js 15 | **$0 / mo** |
| **Backend (8 Microservices)** | [Render](https://render.com) | Free Web Service (512MB RAM, shared CPU), auto-SSL, Git deployments | **$0 / mo** |
| **Database** | [MongoDB Atlas](https://www.mongodb.com/cloud/atlas) | M0 Sandbox (512MB storage, TLS connection, shared RAM) | **$0 / mo** |
| **Email Service** | [Brevo SMTP](https://www.brevo.com) | 300 transactional emails/day ($0/month, sends to any recipient) | **$0 / mo** |
| **Idempotency Store** | In-Memory Engine | Built-in memory store (`IDEMPOTENCY_STORE=memory`), eliminating MySQL | **$0 / mo** |
| **Total Cost** | | | **$0.00** |

---

## 📋 Step 0: Push Code to GitHub

Make sure all recent configuration updates and Dockerfiles are committed and pushed to your GitHub repository:

```bash
# From the project root (c:\Users\USER\Desktop\Web Services\SmartCart):
git add .
git commit -m "feat: configure cloud production deployment and port isolation"
git push origin master
```

---

## ⚙️ Step 1: Deploy Backend on Render ($0 / Free)

Render allows you to run Node.js web services completely free without entering credit card details.

### 1.1 Create Free Account
1. Go to [https://render.com](https://render.com).
2. Sign up using your **GitHub account** (`Ayush17314`).

### 1.2 Create New Web Service
1. In the Render Dashboard, click **New +** $\rightarrow$ **Web Service**.
2. Select **Build and deploy from a Git repository**.
3. Choose your repository: **`Ayush17314/SmartCart`**.

### 1.3 Configure Build Settings
Fill out the service configuration settings:

| Setting | Value |
|---|---|
| **Name** | `smartcart-backend` |
| **Region** | Singapore (`Singapore`) or Frankfurt (choose nearest to India) |
| **Branch** | `master` |
| **Root Directory** | `Backend` |
| **Runtime** | `Node` |
| **Build Command** | `npm run install:all` |
| **Start Command** | `npm start` |
| **Instance Type** | **Free** (0.1 CPU, 512 MB RAM) |

> [!TIP]
> **Alternative Docker Deployment on Render:**
> You can also select **Docker** as the Runtime instead of Node! Render will automatically detect [`Backend/Dockerfile`](file:///c:/Users/USER/Desktop/Web%20Services/SmartCart/Backend/Dockerfile) and build all 8 microservices inside an isolated container with zero extra setup.

### 1.4 Add Backend Environment Variables
Scroll down to **Environment Variables** and add the following keys:

| Environment Variable | Value | Description |
|---|---|---|
| `NODE_ENV` | `production` | Enables production security and cookie policies |
| `IDEMPOTENCY_STORE` | `memory` | Uses in-memory idempotency cache (no MySQL needed!) |
| `NODE_OPTIONS` | `--max-old-space-size=96` | Keeps each microservice lean within the 512MB RAM cap |
| `MONGODB_URI` | `mongodb+srv://ayushdubey1504_db_user:SfjuyRfRLqtu8yAx@cluster0.mgmdzqg.mongodb.net/` | Your MongoDB Atlas connection string |
| `JWT_SECRET` | `a9955a6c8acabae70be5ea1378f14fad75c0c6b761a7dff8e656a1a0a703933c` | Session signing key (32+ chars) |
| `AUTH_EXCHANGE_SECRET` | `8e2d4f8a1c9b6e3f5a7d0c2e4b8a1f3c9e6d2a5b8f1c4e7a0d3b6f9c2e5a8d1` | Shared secret between Frontend and Gateway |
| `NOTIFICATION_SERVICE_SECRET` | `1184921a4210cfae738517065b262c5efc96f5e39b0b0c73519633f184e10e84` | Internal notification service bearer token |
| `INVENTORY_SERVICE_SECRET` | `f4a7c2e9b1d5f8a3c6e0b2d7f1a4c8e3b5d9f2a6c0e8b3d7f1a5c9e2b6d0f4a` | Internal inventory reservation secret |
| `PAYMENT_SERVICE_SECRET` | `smartcart-internal-payment-service-secret-2026-key` | Internal payment service shared secret |
| `EMAIL_PROVIDER` | `smtp` | Enables direct SMTP delivery via Brevo Relay |
| `SMTP_HOST` | `smtp-relay.brevo.com` | Brevo SMTP server host |
| `SMTP_PORT` | `587` | Brevo SMTP port |
| `SMTP_USER` | `c3506c001@smtp-brevo.com` | Brevo SMTP Login username |
| `SMTP_PASSWORD` | `<your-brevo-smtp-key>` | Brevo SMTP master API key |
| `EMAIL_FROM` | `ayushdubey1504@gmail.com` | Sender email address |
| `CORS_ORIGIN` | `http://localhost:3000` *(update with your Vercel URL after Step 2)* | Allowed web frontend origin |
| `SUPER_ADMIN_NAME` | `Ayush Dubey` | Pre-configured Super Admin name |
| `SUPER_ADMIN_EMAIL` | `ayushdubey1504@gmail.com` | Pre-configured Super Admin email |
| `SUPER_ADMIN_PASSWORD` | `@SuperAdmin123456` | Pre-configured Super Admin password |

### 1.5 Click "Deploy Web Service"
1. Render will fetch your code, run `npm run install:all`, and start all 8 services concurrently.
2. Once the logs show:
   ```json
   {"level":"info","service":"api-gateway","message":"listening","port":10000}
   ```
3. Copy your unique Render service URL from the top of the dashboard:
   `https://smartcart-backend-xxxx.onrender.com`

---

## 🌐 Step 2: Deploy Frontend on Vercel ($0 / Free)

Vercel is the creator of Next.js and hosts Next.js 15 App Router applications with maximum performance, automatic asset optimization, and edge serverless functions.

### 2.1 Create Free Account
1. Go to [https://vercel.com](https://vercel.com).
2. Sign up with **GitHub** (`Ayush17314`).

### 2.2 Import Project
1. On the Vercel Dashboard, click **Add New...** $\rightarrow$ **Project**.
2. Select **`Ayush17314/SmartCart`** and click **Import**.

### 2.3 Configure Root Directory & Environment
1. In the **Project Settings**:
   - **Framework Preset**: `Next.js` (automatically detected)
   - **Root Directory**: Click **Edit** and select **`Frontend/smartcart-web`**.
2. Expand **Environment Variables** and add:

| Key | Value | Notes |
|---|---|---|
| `API_URL` | `https://smartcart-backend-xxxx.onrender.com` | **Your Render Backend URL from Step 1** (no trailing slash) |
| `AUTH_EXCHANGE_SECRET` | `8e2d4f8a1c9b6e3f5a7d0c2e4b8a1f3c9e6d2a5b8f1c4e7a0d3b6f9c2e5a8d1` | **Must match** the value in Backend |
| `NEXT_PUBLIC_SITE_URL` | Leave blank or set to your Vercel URL once generated | Used for absolute redirects and email callbacks |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | `486804727218-a2vuj05ca7sge3jq094tgvbcc2mjigbc.apps.googleusercontent.com` | Google OAuth Client ID |

3. Click **Deploy**.
4. Within ~90 seconds, Vercel will complete the build and assign your production URL:
   `https://smartcart-web-xxxx.vercel.app`

---

## 🔗 Step 3: Link Vercel Domain Back into Render CORS

Now that your Vercel frontend is live, allow it in your Backend CORS configuration:

1. Return to the **Render Dashboard** $\rightarrow$ select your `smartcart-backend` service.
2. Click **Environment**.
3. Edit the `CORS_ORIGIN` variable to include your new Vercel domain:
   ```env
   CORS_ORIGIN=https://smartcart-web-xxxx.vercel.app,http://localhost:3000
   ```
4. Click **Save Changes**. Render will automatically trigger a zero-downtime redeploy.

---

## 🧪 Step 4: Verification & Smoke Test Checklist

Once both services are live, verify the complete shopping and admin flows:

1. **Visit Frontend:**
   - Open your Vercel URL: `https://smartcart-web-xxxx.vercel.app`.
   - Verify that the homepage renders product cards fetched from `product-service` via MongoDB Atlas.
2. **Customer Registration & Login:**
   - Click **Sign In** $\rightarrow$ create a test customer account.
   - Verify that authentication succeeds and the customer avatar appears in the top navigation.
3. **Cart & Wishlist:**
   - Add items to the cart drawer and to the wishlist.
   - Verify quantity adjustments and price calculations work in real time.
4. **Checkout (Cash on Delivery or Razorpay):**
   - Proceed to checkout, fill in shipping address, and choose **Cash on Delivery (COD)**.
   - Click **Place Order**.
   - Verify order creation, atomic stock reduction, and receipt of an order confirmation email from Brevo SMTP.
5. **Super Admin 2FA Portal:**
   - Navigate to `/super-admin`.
   - Log in with:
     - **Email:** `ayushdubey1504@gmail.com`
     - **Password:** `@SuperAdmin123456`
   - Check your Gmail inbox for the 6-digit OTP code sent from Brevo SMTP.
   - Enter the code to access the complete Super Admin management dashboard.

---

## 💡 Pro Tips for Free Cloud Tiers

### 1. Handling Render's 15-Minute Inactivity Sleep
Free web services on Render spin down into a sleep state after 15 minutes of inactivity to conserve resources. When a new visitor arrives, Render wakes up the service in approximately **30–50 seconds**.

**Free Solution (Keep-Alive Ping):**
Use a 100% free uptime monitor like [UptimeRobot](https://uptimerobot.com) or [cron-job.org](https://cron-job.org):
- Create a free HTTP monitor targeting: `https://smartcart-backend-xxxx.onrender.com/api/products`
- Interval: Every **10 minutes**.
- This keeps your backend active and awake 24/7 without spending a penny!

### 2. Alternative 100% Free Backend Hosts

If you prefer alternative free container hosts that do not sleep:
- **[Koyeb](https://koyeb.com):** Provides 1 Free Eco Nano instance with 512MB RAM and global CDN. Supports one-click GitHub and Docker deployments with zero credit card needed.
- **[Zeabur](https://zeabur.com):** Provides a generous free serverless & container tier for full-stack Node.js projects.
- **[Oracle Cloud Always Free](https://www.oracle.com/cloud/free/):** Provides 4 ARM Ampere cores + 24 GB RAM for **$0 forever**. You can run `docker-compose up -d` with MongoDB, MySQL, and all 8 microservices on a single dedicated cloud VM!
