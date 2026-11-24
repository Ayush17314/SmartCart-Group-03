require("dotenv").config();
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
try {
  const rawDns = require("dns");
  if (process.env.DNS_SERVERS) {
    rawDns.setServers(process.env.DNS_SERVERS.split(","));
  }
} catch {}

const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();
const Schema = mongoose.Schema;
const Model = (name, schema) => mongoose.models[name] || mongoose.model(name, new Schema(schema, { timestamps: true }));
const Notification = Model("Notification", {
  type: { type: String, enum: ["email"], required: true },
  event: { type: String, required: true, index: true },
  recipient: { type: String, required: true, lowercase: true, trim: true },
  userId: { type: String, required: true, index: true },
  subject: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 5000 },
  metadata: { type: Schema.Types.Mixed, default: {} },
  idempotencyKey: { type: String, required: true, maxlength: 200 },
  payloadHash: { type: String, required: true },
  status: { type: String, enum: ["QUEUED", "SENDING", "SENT", "MOCKED", "FAILED", "UNCERTAIN", "SKIPPED"], default: "QUEUED", index: true },
  provider: { type: String, default: "smtp" },
  providerMessageId: { type: String, default: null },
  attemptCount: { type: Number, default: 0 },
  nextAttemptAt: { type: Date, default: Date.now, index: true },
  sentAt: { type: Date, default: null },
  lastError: { type: String, default: null, maxlength: 500 },
  outcomeUncertain: { type: Boolean, default: false },
  history: { type: [{ status: String, at: { type: Date, default: Date.now }, detail: String }], default: [] },
});
Notification.schema.index({ idempotencyKey: 1 }, { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } });
Notification.schema.index({ status: 1, nextAttemptAt: 1, createdAt: 1 });

const events = Object.freeze({
  "order.created": { subject: "Your SmartCart order was received", message: (data) => `We received order ${data.orderId}. You can view its status in your SmartCart account.` },
  "order.cancelled": { subject: "Your SmartCart order was cancelled", message: (data) => `Order ${data.orderId} was cancelled.` },
  "payment.succeeded": { subject: "Your SmartCart payment was confirmed", message: (data) => `Payment for order ${data.orderId} was confirmed.` },
  "payment.failed": { subject: "Your SmartCart payment needs attention", message: (data) => `Payment for order ${data.orderId} was not completed. You can retry from your order page.` },
  "payment.refunded": { subject: "Your SmartCart refund was submitted", message: (data) => `A refund for order ${data.orderId} was submitted to the payment provider.` },
  "shipment.updated": { subject: "Your SmartCart shipment was updated", message: (data) => `Shipment details for order ${data.orderId} have been updated.` },
  "return.updated": { subject: "Your SmartCart return was updated", message: (data) => `The return request for order ${data.orderId} is now ${data.status || "updated"}.` },
  "refund.updated": { subject: "Your SmartCart refund was updated", message: (data) => `The refund for order ${data.orderId} is now ${data.status || "updated"}.` },
  "security.account_suspended": { subject: "SmartCart account security notice", message: () => "Your SmartCart account access has been suspended. Contact support if you believe this is an error." },
});

app.disable("x-powered-by");
app.use(cors({ origin: (process.env.CORS_ORIGIN || "http://localhost:3000").split(",").map((value) => value.trim()), credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => {
  req.requestId = req.get("X-Request-Id") || crypto.randomUUID();
  res.set("X-Request-Id", req.requestId);
  if (req.method === "GET") res.set("Cache-Control", req.path === "/health" ? "no-store" : "private, no-cache");
  next();
});

const safeEqual = (received, expected) => {
  const left = Buffer.from(received || "");
  const right = Buffer.from(expected || "");
  return right.length >= 32 && left.length === right.length && crypto.timingSafeEqual(left, right);
};
const reply = (res, data, status = 200) => res.status(status).json({ success: true, data, requestId: res.getHeader("X-Request-Id") });
const error = (res, err) => res.status(err.status || 500).json({ success: false, message: err.status ? err.message : "Internal server error", requestId: res.getHeader("X-Request-Id") });

async function authorize(req, res, next) {
  const serviceSecret = process.env.NOTIFICATION_SERVICE_SECRET || "";
  if (safeEqual(req.get("X-Service-Token"), serviceSecret)) { req.internalService = true; return next(); }
  const authorization = req.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return res.status(401).json({ success: false, message: "Authentication required" });
  try {
    const response = await fetch(`${process.env.AUTH_SERVICE_URL || "http://localhost:4001"}/api/auth/session`, { headers: { Authorization: authorization }, signal: AbortSignal.timeout(3000) });
    if (!response.ok) return res.status(response.status === 401 ? 401 : 503).json({ success: false, message: response.status === 401 ? "Authentication required" : "Authentication service unavailable" });
    const user = (await response.json()).data?.user;
    if (!user?.permissions?.includes("notifications.manage")) return res.status(403).json({ success: false, message: "Insufficient permissions" });
    req.user = user;
    return next();
  } catch { return res.status(503).json({ success: false, message: "Authentication service unavailable" }); }
}

async function notificationProfile(userId, event) {
  if (!mongoose.isValidObjectId(userId)) throw Object.assign(new Error("A valid userId is required"), { status: 400 });
  const profileUrl = new URL(`${process.env.AUTH_SERVICE_URL || "http://localhost:4001"}/internal/users/${encodeURIComponent(userId)}/notification-profile`);
  if (event === "security.account_suspended") profileUrl.searchParams.set("event", event);
  const response = await fetch(profileUrl, {
    headers: { "X-Service-Token": process.env.NOTIFICATION_SERVICE_SECRET || "" }, signal: AbortSignal.timeout(3000),
  });
  if (!response.ok) {
    if (response.status === 404) throw Object.assign(new Error("No active verified email is available for this account"), { status: 409 });
    throw Object.assign(new Error("Auth Service is unavailable"), { status: 503 });
  }
  return (await response.json()).data;
}

function notificationPreferenceKey(event) {
  if (event === "order.created" || event === "order.cancelled") return "orderConfirmation";
  if (event.startsWith("shipment.")) return "shipmentUpdates";
  if (event.startsWith("return.") || event.startsWith("refund.")) return "returnUpdates";
  return null;
}

async function notificationAllowed(event) {
  const key = notificationPreferenceKey(event);
  if (!key) return true;
  try {
    const response = await fetch(`${process.env.PRODUCT_SERVICE_URL || "http://localhost:4002"}/api/settings/public`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) throw new Error("Store settings unavailable");
    const preferences = (await response.json()).data?.notificationPreferences;
    return typeof preferences?.[key] === "boolean" ? preferences[key] : true;
  } catch {
    // The default is to deliver. A settings outage must not silently suppress order updates.
    return true;
  }
}

function payloadFor(event, orderId, status) {
  const template = events[event];
  if (!template) throw Object.assign(new Error("Unsupported notification event"), { status: 400 });
  const data = { orderId: String(orderId || "").slice(0, 100), status: String(status || "").slice(0, 40) };
  if (event.startsWith("order.") || event.startsWith("payment.") || event.startsWith("shipment.") || event.startsWith("return.") || event.startsWith("refund.")) {
    if (!data.orderId) throw Object.assign(new Error("orderId is required for this event"), { status: 400 });
  }
  return { subject: template.subject, message: template.message(data), metadata: { ...(data.orderId ? { orderId: data.orderId } : {}), ...(data.status ? { status: data.status } : {}) } };
}

async function enqueueNotification({ userId, event, orderId, status, idempotencyKey }) {
  const profile = await notificationProfile(String(userId || ""), event);
  const payload = payloadFor(event, orderId, status);
  const key = String(idempotencyKey || `${event}/${orderId || userId}`).trim();
  if (!key || key.length > 200) throw Object.assign(new Error("Idempotency-Key must be between 1 and 200 characters"), { status: 400 });
  const payloadHash = crypto.createHash("sha256").update(JSON.stringify({ userId: profile.id, event, recipient: profile.email, metadata: payload.metadata })).digest("hex");
  const allowed = await notificationAllowed(event);
  try {
    return {
      notification: await Notification.create({
        type: "email",
        event,
        recipient: profile.email,
        userId: profile.id,
        ...payload,
        metadata: { ...payload.metadata, ...(profile.name ? { recipientName: profile.name } : {}) },
        idempotencyKey: key,
        payloadHash,
        ...(allowed ? {} : { status: "SKIPPED", provider: "store-settings", lastError: "Delivery disabled by store notification preferences", history: [{ status: "SKIPPED", detail: "Delivery disabled by store notification preferences" }] })
      }),
      created: true
    };
  } catch (err) {
    if (err.code !== 11000) throw err;
    const existing = await Notification.findOne({ idempotencyKey: key });
    if (!existing) throw Object.assign(new Error("Notification request is being processed"), { status: 409 });
    if (existing.payloadHash !== payloadHash) throw Object.assign(new Error("Idempotency key was used with different notification data"), { status: 409 });
    return { notification: existing, created: false };
  }
}

function formatNotificationEmail(notification) {
  const event = notification.event;
  const orderId = notification.metadata?.orderId || "N/A";
  const name = notification.metadata?.recipientName || "Valued Customer";
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
  const year = new Date().getFullYear();

  let subject = notification.subject;
  let title = "Order Notification";
  let badge = "Order Update";
  let contentHtml = "";
  let ctaText = "View in Account";
  let ctaUrl = `${site}/account/orders`;
  let footerNote = "If you have questions about your order, our customer support team is always here to help.";

  switch (event) {
    case "order.created":
      subject = `🛍️ Order Confirmed: #${orderId} — Thank you for shopping with SmartCart!`;
      title = "Order Confirmation";
      badge = "Order Placed";
      contentHtml = `
        <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Thank You for Your Order!</h2>
        <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">Hello <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #334155; font-size: 15px; line-height: 1.6;">
          We're delighted to let you know that your order <strong>#${orderId}</strong> has been placed successfully and is now being processed.
        </p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-left: 4px solid #10b981; padding: 18px 20px; border-radius: 8px; margin-bottom: 24px;">
          <table width="100%" border="0" cellspacing="0" cellpadding="0">
            <tr>
              <td>
                <span style="font-size: 12px; font-weight: 600; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Order Number</span>
                <div style="font-size: 18px; font-weight: 700; color: #0f172a; font-family: monospace; margin-top: 4px;">#${orderId}</div>
              </td>
              <td align="right">
                <span style="display: inline-block; background-color: #dcfce7; color: #15803d; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 9999px;">Confirmed</span>
              </td>
            </tr>
          </table>
          <p style="margin: 12px 0 0 0; font-size: 13px; color: #475569; line-height: 1.5;">
            Our fulfillment team is carefully preparing your package. We will send you another update with tracking information as soon as your items ship.
          </p>
        </div>
        <p style="margin: 0 0 8px 0; color: #334155; font-size: 14px; line-height: 1.6;">
          You can check live tracking, download your invoice, or view your full order history anytime from your account dashboard.
        </p>
      `;
      ctaText = "View Order Details";
      ctaUrl = `${site}/account/orders`;
      break;

    case "order.cancelled":
      subject = `Order #${orderId} Has Been Cancelled — SmartCart`;
      title = "Order Cancelled";
      badge = "Cancelled";
      contentHtml = `
        <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Order Cancellation Notice</h2>
        <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">Hello <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #334155; font-size: 15px; line-height: 1.6;">
          Your order <strong>#${orderId}</strong> has been cancelled.
        </p>
        <div style="background-color: #fef2f2; border: 1px solid #fee2e2; border-left: 4px solid #ef4444; padding: 18px 20px; border-radius: 8px; margin-bottom: 24px;">
          <p style="margin: 0; color: #991b1b; font-size: 14px; line-height: 1.5;">
            If any payment was already collected for this order, a full refund has been initiated to your original payment method. Depending on your bank, funds typically reflect within 3-5 business days.
          </p>
        </div>
      `;
      ctaText = "Browse Products";
      ctaUrl = `${site}/products`;
      break;

    case "payment.succeeded":
      subject = `💳 Payment Confirmed for Order #${orderId} — SmartCart`;
      title = "Payment Confirmed";
      badge = "Payment Received";
      contentHtml = `
        <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Payment Confirmed</h2>
        <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">Hello <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #334155; font-size: 15px; line-height: 1.6;">
          Your payment for order <strong>#${orderId}</strong> has been successfully confirmed.
        </p>
        <div style="background-color: #f0fdf4; border: 1px solid #dcfce7; border-left: 4px solid #22c55e; padding: 18px 20px; border-radius: 8px; margin-bottom: 24px;">
          <p style="margin: 0; color: #166534; font-size: 14px; font-weight: 600;">Status: Payment Complete</p>
          <p style="margin: 6px 0 0 0; color: #166534; font-size: 13px;">Your order is currently being prepared for dispatch.</p>
        </div>
      `;
      ctaText = "View Order Status";
      ctaUrl = `${site}/account/orders`;
      break;

    case "payment.failed":
      subject = `⚠️ Payment Action Required for Order #${orderId} — SmartCart`;
      title = "Payment Failed";
      badge = "Action Required";
      contentHtml = `
        <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Payment Was Not Completed</h2>
        <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">Hello <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #334155; font-size: 15px; line-height: 1.6;">
          We were unable to complete the payment for order <strong>#${orderId}</strong>.
        </p>
        <div style="background-color: #fffbeb; border: 1px solid #fef3c7; border-left: 4px solid #f59e0b; padding: 18px 20px; border-radius: 8px; margin-bottom: 24px;">
          <p style="margin: 0; color: #92400e; font-size: 14px; line-height: 1.5;">
            Please retry your payment with an updated payment method to secure your items before the reservation expires.
          </p>
        </div>
      `;
      ctaText = "Retry Payment Now";
      ctaUrl = `${site}/account/orders`;
      break;

    case "shipment.updated":
      const shipStatus = notification.metadata?.status || "Updated";
      subject = `🚚 Shipment Update for Order #${orderId} (${shipStatus}) — SmartCart`;
      title = "Shipment Update";
      badge = shipStatus;
      contentHtml = `
        <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Shipment Status Update</h2>
        <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">Hello <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #334155; font-size: 15px; line-height: 1.6;">
          The shipment status for order <strong>#${orderId}</strong> has been updated to <strong>${shipStatus}</strong>.
        </p>
        <div style="background-color: #eff6ff; border: 1px solid #dbeafe; border-left: 4px solid #3b82f6; padding: 18px 20px; border-radius: 8px; margin-bottom: 24px;">
          <p style="margin: 0; color: #1e40af; font-size: 14px; font-weight: 600;">Current Shipment Status: ${shipStatus}</p>
          <p style="margin: 6px 0 0 0; color: #1e40af; font-size: 13px;">Follow the link below to view tracking details and estimated delivery.</p>
        </div>
      `;
      ctaText = "Track Shipment";
      ctaUrl = `${site}/account/orders`;
      break;

    case "return.updated":
      const retStatus = notification.metadata?.status || "Updated";
      subject = `Return Update for Order #${orderId} — SmartCart`;
      title = "Return Request Update";
      badge = retStatus;
      contentHtml = `
        <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Return Request Status</h2>
        <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">Hello <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #334155; font-size: 15px; line-height: 1.6;">
          Your return request for order <strong>#${orderId}</strong> is now: <strong>${retStatus}</strong>.
        </p>
      `;
      ctaText = "View Return Details";
      ctaUrl = `${site}/account/orders`;
      break;

    case "refund.updated":
    case "payment.refunded":
      subject = `Refund Processed for Order #${orderId} — SmartCart`;
      title = "Refund Confirmation";
      badge = "Refunded";
      contentHtml = `
        <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Refund Update</h2>
        <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">Hello <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #334155; font-size: 15px; line-height: 1.6;">
          A refund for order <strong>#${orderId}</strong> has been issued.
        </p>
        <div style="background-color: #f0fdf4; border: 1px solid #dcfce7; border-left: 4px solid #10b981; padding: 18px 20px; border-radius: 8px; margin-bottom: 24px;">
          <p style="margin: 0; color: #166534; font-size: 14px;">The refund has been transferred to your original payment method.</p>
        </div>
      `;
      ctaText = "View Account";
      ctaUrl = `${site}/account/orders`;
      break;

    case "security.account_suspended":
      subject = "⚠️ SmartCart Account Security Notice";
      title = "Security Notice";
      badge = "Notice";
      contentHtml = `
        <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700;">Account Access Notice</h2>
        <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">Hello <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #334155; font-size: 15px; line-height: 1.6;">
          Your SmartCart account access has been suspended due to security or policy review.
        </p>
        <p style="margin: 0 0 16px 0; color: #64748b; font-size: 14px; line-height: 1.5;">
          If you believe this is an error or need assistance, please contact our support team.
        </p>
      `;
      ctaText = "Contact Support";
      ctaUrl = `${site}/support`;
      break;

    default:
      contentHtml = `
        <h2 style="margin: 0 0 12px 0; color: #0f172a; font-size: 20px; font-weight: 700;">${notification.subject}</h2>
        <p style="margin: 0 0 16px 0; color: #334155; font-size: 15px; line-height: 1.6;">Hello <strong>${name}</strong>,</p>
        <p style="margin: 0 0 20px 0; color: #334155; font-size: 15px; line-height: 1.6;">
          ${notification.message}
        </p>
      `;
      break;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-font-smoothing: antialiased;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color: #f8fafc; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="100%" border="0" cellspacing="0" cellpadding="0" style="max-width: 580px; background-color: #ffffff; border-radius: 14px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
          <tr>
            <td style="background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); padding: 24px 30px;">
              <table width="100%" border="0" cellspacing="0" cellpadding="0">
                <tr>
                  <td>
                    <span style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: -0.5px;">Smart<span style="color: #10b981;">Cart</span></span>
                  </td>
                  ${badge ? `<td align="right"><span style="display: inline-block; background-color: rgba(255,255,255,0.15); color: #ffffff; padding: 4px 12px; border-radius: 9999px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">${badge}</span></td>` : ''}
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding: 30px;">
              ${contentHtml}
              ${ctaUrl && ctaText ? `
                <div style="margin: 28px 0; text-align: center;">
                  <a href="${ctaUrl}" style="display: inline-block; background-color: #0f172a; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 28px; border-radius: 8px;">${ctaText}</a>
                </div>
              ` : ''}
              ${footerNote ? `<p style="margin: 24px 0 0 0; font-size: 12px; color: #64748b; line-height: 1.5; border-top: 1px solid #f1f5f9; padding-top: 16px;">${footerNote}</p>` : ''}
            </td>
          </tr>
          <tr>
            <td style="background-color: #f8fafc; padding: 18px 30px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0; font-size: 12px; color: #94a3b8;">&copy; ${year} SmartCart Inc. All rights reserved.</p>
              <p style="margin: 4px 0 0 0; font-size: 11px; color: #94a3b8;">This is an automated notification regarding your SmartCart order.</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, text: notification.message, html };
}

async function sendWithSmtp(notification) {
  const nodemailer = require("nodemailer");
  const user = process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_FROM;
  const pass = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    console.warn("[notification-service] SMTP credentials not configured; skipping email notification");
    return { delivered: false };
  }

  const fromEmail = process.env.EMAIL_FROM || user;
  const emailData = formatNotificationEmail(notification);
  const subject = emailData.subject || notification.subject;
  const text = emailData.text || notification.message;
  const html = emailData.html;

  // 1. Direct Brevo HTTPS API (port 443 - bypasses cloud firewall SMTP port 587 timeouts)
  if (pass.startsWith("xkeysib-")) {
    try {
      const apiRes = await fetch("https://api.brevo.com/v3/smtp/email", {
        method: "POST",
        headers: {
          accept: "application/json",
          "api-key": pass,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          sender: { name: "SmartCart", email: fromEmail },
          to: [{ email: notification.recipient }],
          subject,
          htmlContent: html || text,
          textContent: text,
        }),
        signal: AbortSignal.timeout(6000),
      });
      if (apiRes.ok) {
        const result = await apiRes.json();
        console.log(`[notification-service] Email successfully sent via Brevo HTTPS API to ${notification.recipient}:`, result.messageId);
        return result.messageId;
      }
      const errText = await apiRes.text();
      console.warn("[notification-service] Brevo HTTPS API returned error, attempting SMTP fallback:", errText);
    } catch (e) {
      console.warn("[notification-service] Brevo HTTPS API request failed, attempting SMTP fallback:", e.message);
    }
  }

  // 2. SMTP Transport with Port 465 (Direct SSL), Port 2525, and Port 587 Fallback
  const host = process.env.SMTP_HOST || "smtp-relay.brevo.com";
  const configuredPort = Number(process.env.SMTP_PORT) || 465;

  const portsToTry = configuredPort === 465
    ? [{ port: 465, secure: true }, { port: 2525, secure: false }, { port: 587, secure: false }]
    : [{ port: configuredPort, secure: configuredPort === 465 }, { port: 465, secure: true }, { port: 2525, secure: false }];

  let lastError = null;
  for (const { port, secure } of portsToTry) {
    try {
      console.log(`[notification-service] Attempting SMTP delivery to ${notification.recipient} via ${host}:${port} (secure=${secure})...`);
      const transporter = nodemailer.createTransport({
        host,
        port,
        secure,
        auth: { user, pass },
        connectionTimeout: 5000,
        greetingTimeout: 5000,
        socketTimeout: 6000,
      });

      const info = await transporter.sendMail({
        from: `"SmartCart" <${fromEmail}>`,
        to: notification.recipient,
        subject,
        text,
        html,
      });

      console.log(`[notification-service] Email successfully delivered to ${notification.recipient} via ${host}:${port}:`, info.messageId);
      return info.messageId || `smtp-${Date.now()}`;
    } catch (err) {
      console.warn(`[notification-service] SMTP attempt on ${host}:${port} failed: ${err.message}`);
      lastError = err;
    }
  }

  throw lastError || new Error("Failed to deliver notification email through all SMTP transports");
}

async function processOne(id) {
  const notification = await Notification.findOneAndUpdate(
    { _id: id, status: "QUEUED", nextAttemptAt: { $lte: new Date() } },
    { $set: { status: "SENDING", lastError: null }, $inc: { attemptCount: 1 }, $push: { history: { $each: [{ status: "SENDING", detail: "Delivery attempt started" }], $slice: -30 } } },
    { new: true },
  );
  if (!notification) return;
  if ((process.env.EMAIL_PROVIDER || "mock") === "mock" && process.env.NODE_ENV !== "production") {
    await Notification.updateOne({ _id: notification._id, status: "SENDING" }, { $set: { status: "MOCKED", provider: "mock", lastError: null }, $push: { history: { $each: [{ status: "MOCKED", detail: "Development mock; no email was sent" }], $slice: -30 } } });
    return;
  }
  try {
    const providerMessageId = await sendWithSmtp(notification);
    await Notification.updateOne({ _id: notification._id, status: "SENDING" }, { $set: { status: "SENT", provider: "smtp", providerMessageId, sentAt: new Date(), lastError: null }, $push: { history: { $each: [{ status: "SENT", detail: `Accepted by SMTP (${providerMessageId})` }], $slice: -30 } } });
    console.info(JSON.stringify({ level: "info", service: "notification-service", notificationId: String(notification._id), event: notification.event, status: "SENT" }));
  } catch (err) {
    const maxAttempts = Math.min(Math.max(Number(process.env.NOTIFICATION_MAX_ATTEMPTS) || 5, 1), 10);
    const retry = err.retryable !== false && notification.attemptCount < maxAttempts;
    const uncertain = notification.outcomeUncertain || err.outcomeUncertain === true || (!err.httpStatus && err.retryable !== false);
    const status = retry ? "QUEUED" : uncertain ? "UNCERTAIN" : "FAILED";
    const delayMs = Math.min(30_000 * (2 ** Math.max(notification.attemptCount - 1, 0)), 8 * 60_000);
    const lastError = String(err.message || "Delivery failed").slice(0, 500);
    await Notification.updateOne({ _id: notification._id, status: "SENDING" }, {
      $set: { status, provider: process.env.EMAIL_PROVIDER || "mock", lastError, outcomeUncertain: uncertain, nextAttemptAt: retry ? new Date(Date.now() + delayMs) : null },
      $push: { history: { $each: [{ status, detail: lastError }], $slice: -30 } },
    });
    console.warn(JSON.stringify({ level: "warn", service: "notification-service", notificationId: String(notification._id), status, attempt: notification.attemptCount, retry }));
  }
}

let workerRunning = false;
async function processQueue() {
  if (workerRunning || mongoose.connection.readyState !== 1) return;
  workerRunning = true;
  try {
    await Notification.updateMany({ status: "QUEUED", $or: [{ event: { $exists: false } }, { recipient: { $exists: false } }, { userId: { $exists: false } }, { idempotencyKey: { $exists: false } }] }, {
      $set: { status: "FAILED", lastError: "Legacy queued record is missing verified delivery fields" },
      $push: { history: { $each: [{ status: "FAILED", detail: "Legacy record requires a new verified notification request" }], $slice: -30 } },
    });
    const stale = new Date(Date.now() - 2 * 60_000);
    await Notification.updateMany({ status: "SENDING", updatedAt: { $lt: stale } }, { $set: { status: "QUEUED", nextAttemptAt: new Date() }, $push: { history: { $each: [{ status: "QUEUED", detail: "Recovered stale delivery lease" }], $slice: -30 } } });
    const pending = await Notification.find({ status: "QUEUED", nextAttemptAt: { $lte: new Date() } }).sort({ createdAt: 1 }).limit(10).select("_id").lean();
    await Promise.all(pending.map(async ({ _id }) => {
      try { await processOne(_id); }
      catch (err) { console.error(JSON.stringify({ level: "error", service: "notification-service", notificationId: String(_id), message: err.message })); }
    }));
  } catch (err) {
    console.error(JSON.stringify({ level: "error", service: "notification-service", message: "Queue polling failed", error: err.message }));
  } finally { workerRunning = false; }
}

app.get("/health", (req, res) => res.set("Cache-Control", "no-store").json({ service: "notification-service", status: "OK" }));
app.post("/api/notifications/:type", authorize, async (req, res) => {
  if (!["email", "order", "payment", "sms"].includes(req.params.type)) return res.status(404).json({ success: false, message: "Notification type not found" });
  if (req.params.type === "sms") return res.status(503).json({ success: false, message: "SMS provider is not configured" });
  if (req.params.type === "email" && !req.internalService && !req.user?.permissions?.includes("notifications.manage")) return res.status(403).json({ success: false, message: "Insufficient permissions" });
  try {
    const event = req.body.event || (req.params.type === "order" ? "order.created" : "payment.succeeded");
    const { notification, created } = await enqueueNotification({
      userId: req.body.userId || req.user?.id,
      event,
      orderId: req.body.orderId,
      status: req.body.status,
      idempotencyKey: req.get("Idempotency-Key"),
    });
    if (created) setTimeout(() => { void processQueue(); }, 0);
    return reply(res, { id: String(notification._id), event: notification.event, status: notification.status, created }, 202);
  } catch (err) { return error(res, err); }
});

app.get("/api/notifications", authorize, async (req, res) => {
  if (!req.user?.permissions?.includes("notifications.manage")) return res.status(403).json({ success: false, message: "Insufficient permissions" });
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = {};
  if (req.query.status) {
    if (!["QUEUED", "SENDING", "SENT", "MOCKED", "FAILED", "UNCERTAIN", "SKIPPED"].includes(String(req.query.status))) return res.status(400).json({ success: false, message: "Invalid notification status" });
    filter.status = req.query.status;
  }
  try {
    const [items, total] = await Promise.all([Notification.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Notification.countDocuments(filter)]);
    return res.json({ success: true, data: items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (err) { return error(res, err); }
});

app.post("/api/notifications/:id/retry", authorize, async (req, res) => {
  if (!req.user?.permissions?.includes("notifications.manage")) return res.status(403).json({ success: false, message: "Insufficient permissions" });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid notification id" });
  try {
    const item = await Notification.findOneAndUpdate({ _id: req.params.id, status: "FAILED" }, { $set: { status: "QUEUED", attemptCount: 0, nextAttemptAt: new Date(), lastError: null }, $push: { history: { $each: [{ status: "QUEUED", detail: "Manually requeued by an authorized user" }], $slice: -30 } } }, { new: true });
    if (!item) return res.status(409).json({ success: false, message: "Only a failed notification can be retried" });
    setTimeout(() => { void processQueue(); }, 0);
    return reply(res, { id: String(item._id), status: item.status }, 202);
  } catch (err) { return error(res, err); }
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && Object.hasOwn(err, "body")) return res.status(400).json({ success: false, message: "Invalid JSON", requestId: req.requestId });
  return error(res, err);
});

const port = Number(process.env.NOTIFICATION_PORT || process.env.NOTIFICATION_SERVICE_PORT) || 4007;
if (require.main === module) {
  if (process.env.NODE_ENV === "production" && (!process.env.NOTIFICATION_SERVICE_SECRET || process.env.NOTIFICATION_SERVICE_SECRET.length < 32 || /change-me|replace-with|local-development/i.test(process.env.NOTIFICATION_SERVICE_SECRET))) {
    console.error("A strong NOTIFICATION_SERVICE_SECRET is required in production");
    process.exit(1);
  }
  const user = process.env.SMTP_USER || process.env.GMAIL_USER || process.env.EMAIL_FROM;
  const pass = process.env.SMTP_PASSWORD || process.env.GMAIL_APP_PASSWORD;
  if (process.env.NODE_ENV === "production" && (!user || !pass)) {
    console.warn("SMTP credentials not configured. Email notifications will be skipped until SMTP_USER and SMTP_PASSWORD are provided.");
  }
  mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017", { dbName: process.env.MONGODB_DB || "smartcart_notification" })
    .then(() => {
      app.listen(port, () => console.log(JSON.stringify({ level: "info", service: "notification-service", message: "listening", port })));
      setInterval(() => { void processQueue(); }, 1000).unref();
    })
    .catch((err) => { console.error("MongoDB connection failed", err.message); process.exit(1); });
}

module.exports = { app, Notification, enqueueNotification, processQueue, payloadFor, notificationPreferenceKey, notificationAllowed, safeEqual };
