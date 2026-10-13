require("dotenv").config();
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

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
  provider: { type: String, default: "resend" },
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
    return { notification: await Notification.create({ type: "email", event, recipient: profile.email, userId: profile.id, ...payload, idempotencyKey: key, payloadHash, ...(allowed ? {} : { status: "SKIPPED", provider: "store-settings", lastError: "Delivery disabled by store notification preferences", history: [{ status: "SKIPPED", detail: "Delivery disabled by store notification preferences" }] }) }), created: true };
  } catch (err) {
    if (err.code !== 11000) throw err;
    const existing = await Notification.findOne({ idempotencyKey: key });
    if (!existing) throw Object.assign(new Error("Notification request is being processed"), { status: 409 });
    if (existing.payloadHash !== payloadHash) throw Object.assign(new Error("Idempotency key was used with different notification data"), { status: 409 });
    return { notification: existing, created: false };
  }
}

async function sendWithResend(notification) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json", "Idempotency-Key": notification.idempotencyKey },
    body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [notification.recipient], subject: notification.subject, text: notification.message }),
    signal: AbortSignal.timeout(Number(process.env.EMAIL_TIMEOUT_MS) || 8000),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.message || "Email provider rejected the message"), { retryable: response.status === 429 || response.status === 409 || response.status >= 500, outcomeUncertain: response.status === 409 || response.status >= 500, httpStatus: response.status });
  if (!result.id) throw Object.assign(new Error("Email provider did not return a message id"), { retryable: true });
  return result.id;
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
    if (process.env.EMAIL_PROVIDER !== "resend" || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw Object.assign(new Error("Resend email provider is not configured"), { retryable: false });
    const providerMessageId = await sendWithResend(notification);
    await Notification.updateOne({ _id: notification._id, status: "SENDING" }, { $set: { status: "SENT", provider: "resend", providerMessageId, sentAt: new Date(), lastError: null }, $push: { history: { $each: [{ status: "SENT", detail: `Accepted by provider (${providerMessageId})` }], $slice: -30 } } });
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

const port = Number(process.env.PORT) || 4007;
if (require.main === module) {
  if (process.env.NODE_ENV === "production" && (!process.env.NOTIFICATION_SERVICE_SECRET || process.env.NOTIFICATION_SERVICE_SECRET.length < 32 || /change-me|replace-with|local-development/i.test(process.env.NOTIFICATION_SERVICE_SECRET))) {
    console.error("A strong NOTIFICATION_SERVICE_SECRET is required in production");
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && (process.env.EMAIL_PROVIDER !== "resend" || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)) {
    console.error("Configure Resend before starting Notification Service in production");
    process.exit(1);
  }
  mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017", { dbName: process.env.MONGODB_DB || "smartcart_notification" })
    .then(() => {
      app.listen(port, () => console.log(JSON.stringify({ level: "info", service: "notification-service", message: "listening", port })));
      setInterval(() => { void processQueue(); }, 1000).unref();
    })
    .catch((err) => { console.error("MongoDB connection failed", err.message); process.exit(1); });
}

module.exports = { app, Notification, enqueueNotification, processQueue, payloadFor, notificationPreferenceKey, notificationAllowed, safeEqual };
