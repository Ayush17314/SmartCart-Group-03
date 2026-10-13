require("dotenv").config();
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
const Schema = mongoose.Schema;

app.use(cors({ origin: (process.env.CORS_ORIGIN || "http://localhost:3000").split(",").map((value) => value.trim()), credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => {
  req.requestId = req.get("X-Request-Id") || crypto.randomUUID();
  res.set("X-Request-Id", req.requestId);
  if (req.method === "GET" || req.method === "HEAD") {
    const publicProductPath = req.path === "/api/products" || req.path === "/api/products/search" || req.path.startsWith("/api/products/category/") || /^\/api\/products\/[a-f\d]{24}$/.test(req.path) || /^\/api\/products\/[a-f\d]{24}\/reviews$/.test(req.path);
    const publicPath = req.path === "/health" || req.path === "/api/settings/public" || publicProductPath;
    res.set("Cache-Control", publicPath ? "public, max-age=30, must-revalidate" : "private, no-cache");
  }
  next();
});

const Model = (name, schema) =>
  mongoose.models[name] || mongoose.model(name, new Schema(schema, { timestamps: true }));

const reply = (res, data, status = 200) => res.status(status).json({ success: true, data });
const error = (res, err) => {
  const requestId = res.getHeader("X-Request-Id") || res.req?.requestId;
  if (err.code === 11000) return res.status(409).json({ success: false, message: "A product with this SKU already exists", requestId });
  if (err.name === "ValidationError" || err.name === "CastError") {
    return res.status(400).json({ success: false, message: err.message, requestId });
  }
  return res.status(err.status || 500).json({
    success: false,
    message: err.status ? err.message : "Internal server error",
    requestId,
  });
};

const auth = async (req, res, next) => {
  const authorization = req.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return res.status(401).json({ success: false, message: "Authentication required" });
  try {
    const response = await fetch(`${process.env.AUTH_SERVICE_URL || "http://localhost:4001"}/api/auth/session`, {
      headers: { Authorization: authorization }, signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return res.status(response.status === 401 ? 401 : 503).json({ success: false, message: response.status === 401 ? "Authentication required" : "Authentication service unavailable" });
    const body = await response.json();
    req.user = body.data.user;
    return next();
  } catch {
    return res.status(503).json({ success: false, message: "Authentication service unavailable" });
  }
};
const requirePermission = (permission) => (req, res, next) =>
  req.user.permissions?.includes(permission)
    ? next()
    : res.status(403).json({ success: false, message: "Insufficient permissions" });
const productWrite = [auth, requirePermission("products.write")];
const inventoryWrite = [auth, requirePermission("inventory.write")];
const guard = productWrite;

const Product = Model("Product", {
  name: { type: String, required: true, trim: true, maxlength: 200 },
  sku: { type: String, trim: true, uppercase: true, maxlength: 80 },
  description: { type: String, trim: true, maxlength: 5000 },
  price: { type: Number, required: true, min: 0 },
  category: { type: String, required: true, trim: true, maxlength: 100 },
  brand: { type: String, trim: true, maxlength: 100 },
  images: { type: [String], default: [] },
  stock: { type: Number, default: 0, min: 0, validate: Number.isInteger },
  rating: { type: Number, default: 0, min: 0, max: 5 },
  specifications: Schema.Types.Mixed,
  archivedAt: { type: Date, default: null, index: true },
  stockHistory: { type: [{ actorUserId: String, previousStock: Number, newStock: Number, reason: String, changedAt: { type: Date, default: Date.now } }], default: [], select: false },
  stockReservations: { type: [{ orderId: { type: String, required: true }, quantity: { type: Number, required: true, min: 1 }, reservedAt: { type: Date, default: Date.now } }], default: [], select: false },
});
const Review = Model("Review", {
  productId: { type: String, required: true, index: true },
  userId: { type: String, required: true },
  userName: { type: String, required: true, trim: true, maxlength: 100 },
  rating: { type: Number, required: true, min: 1, max: 5, validate: Number.isInteger },
  title: { type: String, required: true, trim: true, minlength: 3, maxlength: 120 },
  body: { type: String, required: true, trim: true, minlength: 10, maxlength: 2000 },
  status: { type: String, enum: ["PENDING", "APPROVED", "HIDDEN", "REMOVED"], default: "PENDING", index: true },
  reportCount: { type: Number, default: 0, min: 0 },
  reportedBy: { type: [String], default: [], select: false },
  reports: { type: [{ userId: String, reason: { type: String, maxlength: 500 }, createdAt: { type: Date, default: Date.now } }], default: [], select: false },
  moderationReason: { type: String, trim: true, maxlength: 500, default: "" },
  moderatedBy: { type: String, default: null },
  moderationHistory: { type: [{ status: { type: String, enum: ["APPROVED", "HIDDEN", "REMOVED"] }, reason: String, actorUserId: String, changedAt: { type: Date, default: Date.now } }], default: [] },
},);
Review.schema.index({ productId: 1, userId: 1 }, { unique: true });
Review.schema.index({ productId: 1, status: 1, createdAt: -1 });

const StoreSettings = Model("StoreSettings", {
  _id: { type: String, default: "store" },
  storeName: { type: String, default: "SmartCart", trim: true, maxlength: 100 },
  logoUrl: { type: String, default: "", trim: true, maxlength: 2048 },
  currency: { type: String, enum: ["INR", "USD", "EUR"], default: process.env.PAYMENT_CURRENCY || "INR" },
  taxRate: { type: Number, default: 0, min: 0, max: 100 },
  shippingFee: { type: Number, default: 0, min: 0 },
  freeShippingThreshold: { type: Number, default: 0, min: 0 },
  lowStockThreshold: { type: Number, default: 5, min: 0, max: 100000, validate: Number.isInteger },
  returnPolicy: { type: String, default: "", trim: true, maxlength: 5000 },
  notificationPreferences: {
    orderConfirmation: { type: Boolean, default: true },
    shipmentUpdates: { type: Boolean, default: true },
    returnUpdates: { type: Boolean, default: true },
  },
  promotionDefaults: {
    maxUsageLimit: { type: Number, default: 1000, min: 1, max: 10000, validate: Number.isInteger },
    defaultPerCustomerLimit: { type: Number, default: 1, min: 1, max: 10000, validate: Number.isInteger },
  },
});
const SettingsAudit = Model("SettingsAudit", {
  actorUserId: { type: String, required: true },
  changes: { type: Schema.Types.Mixed, required: true },
  changedAt: { type: Date, default: Date.now, index: true },
});
const ProductAuditEvent = Model("ProductAuditEvent", {
  actorUserId: { type: String, required: true },
  action: { type: String, required: true, index: true },
  metadata: { type: Schema.Types.Mixed, default: {} },
});

async function appendInventoryEvent(productId, event) {
  try {
    await Product.updateOne({ _id: productId }, { $push: { stockHistory: { $each: [event], $slice: -1000 } } });
  } catch (err) {
    console.error("Inventory movement history write failed", err.message);
  }
}

Product.schema.index({ category: 1, price: 1 });
Product.schema.index({ brand: 1 });
Product.schema.index({ name: "text", description: "text", brand: "text" });
Product.schema.index({ sku: 1 }, { unique: true, partialFilterExpression: { sku: { $type: "string", $gt: "" } } });
Product.schema.index({ "stockReservations.orderId": 1 });

app.get("/health", (req, res) =>
  res.json({ service: "product-service", status: "OK", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }));

const environmentLowStockThreshold = Number(process.env.LOW_STOCK_THRESHOLD);
const DEFAULT_STORE_SETTINGS = {
  _id: "store", storeName: "SmartCart", logoUrl: "", currency: process.env.PAYMENT_CURRENCY || "INR", taxRate: 0, shippingFee: 0,
  freeShippingThreshold: 0, lowStockThreshold: Number.isFinite(environmentLowStockThreshold) ? Math.max(0, environmentLowStockThreshold) : 5, returnPolicy: "",
  notificationPreferences: { orderConfirmation: true, shipmentUpdates: true, returnUpdates: true },
  promotionDefaults: { maxUsageLimit: 1000, defaultPerCustomerLimit: 1 },
};
const publicSettings = (settings) => ({
  storeName: settings?.storeName ?? DEFAULT_STORE_SETTINGS.storeName,
  logoUrl: settings?.logoUrl ?? DEFAULT_STORE_SETTINGS.logoUrl,
  currency: settings?.currency ?? DEFAULT_STORE_SETTINGS.currency,
  taxRate: settings?.taxRate ?? DEFAULT_STORE_SETTINGS.taxRate,
  shippingFee: settings?.shippingFee ?? DEFAULT_STORE_SETTINGS.shippingFee,
  freeShippingThreshold: settings?.freeShippingThreshold ?? DEFAULT_STORE_SETTINGS.freeShippingThreshold,
  lowStockThreshold: settings?.lowStockThreshold ?? DEFAULT_STORE_SETTINGS.lowStockThreshold,
  returnPolicy: settings?.returnPolicy ?? DEFAULT_STORE_SETTINGS.returnPolicy,
  notificationPreferences: { ...DEFAULT_STORE_SETTINGS.notificationPreferences, ...(settings?.notificationPreferences || {}) },
  promotionDefaults: { ...DEFAULT_STORE_SETTINGS.promotionDefaults, ...(settings?.promotionDefaults || {}) },
});

app.get("/api/settings/public", async (req, res) => {
  try { return reply(res, publicSettings(await StoreSettings.findById("store").lean())); }
  catch (err) { return error(res, err); }
});

app.get("/api/settings", auth, requirePermission("settings.manage"), async (req, res) => {
  try { return reply(res, publicSettings(await StoreSettings.findById("store").lean())); }
  catch (err) { return error(res, err); }
});

app.put("/api/settings", auth, requirePermission("settings.manage"), async (req, res) => {
  try {
    const body = req.body || {};
    const storeName = String(body.storeName || "").trim();
    const logoUrl = String(body.logoUrl || "").trim();
    if (!storeName || storeName.length > 100) return res.status(400).json({ success: false, message: "Store name is required and must be 100 characters or fewer" });
    if (logoUrl && (!/^https:\/\//i.test(logoUrl) || logoUrl.length > 2048)) return res.status(400).json({ success: false, message: "Logo URL must be a secure HTTPS URL" });
    if (!["INR", "USD", "EUR"].includes(body.currency) || body.currency !== String(process.env.PAYMENT_CURRENCY || "INR").toUpperCase()) return res.status(400).json({ success: false, message: "Store currency must be a supported currency and match PAYMENT_CURRENCY" });
    const numeric = ["taxRate", "shippingFee", "freeShippingThreshold", "lowStockThreshold"];
    for (const key of numeric) {
      const value = Number(body[key]);
      if (!Number.isFinite(value) || value < 0 || ((key === "taxRate") && value > 100) || ((key === "lowStockThreshold") && (!Number.isInteger(value) || value > 100000))) return res.status(400).json({ success: false, message: `Invalid ${key}` });
    }
    const notifications = body.notificationPreferences || {};
    const promotions = body.promotionDefaults || {};
    if (!["orderConfirmation", "shipmentUpdates", "returnUpdates"].every((key) => typeof notifications[key] === "boolean")) return res.status(400).json({ success: false, message: "Notification preferences must be boolean values" });
    if (!Number.isInteger(Number(promotions.maxUsageLimit)) || Number(promotions.maxUsageLimit) < 1 || Number(promotions.maxUsageLimit) > 10000 || !Number.isInteger(Number(promotions.defaultPerCustomerLimit)) || Number(promotions.defaultPerCustomerLimit) < 1 || Number(promotions.defaultPerCustomerLimit) > Number(promotions.maxUsageLimit)) return res.status(400).json({ success: false, message: "Invalid promotion defaults" });
    const values = {
      storeName, logoUrl, currency: body.currency, taxRate: Number(body.taxRate), shippingFee: Number(body.shippingFee),
      freeShippingThreshold: Number(body.freeShippingThreshold), lowStockThreshold: Number(body.lowStockThreshold),
      returnPolicy: String(body.returnPolicy || "").trim().slice(0, 5000),
      notificationPreferences: { orderConfirmation: notifications.orderConfirmation, shipmentUpdates: notifications.shipmentUpdates, returnUpdates: notifications.returnUpdates },
      promotionDefaults: { maxUsageLimit: Number(promotions.maxUsageLimit), defaultPerCustomerLimit: Number(promotions.defaultPerCustomerLimit) },
    };
    const previous = publicSettings(await StoreSettings.findById("store").lean());
    const saved = await StoreSettings.findOneAndUpdate({ _id: "store" }, { $set: values }, { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }).lean();
    const changedKeys = Object.keys(values).filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(saved[key]));
    if (changedKeys.length) {
      await SettingsAudit.create({ actorUserId: req.user.id || req.user.userId, changes: Object.fromEntries(changedKeys.map((key) => [key, { before: previous[key], after: saved[key] }])) });
    }
    return reply(res, publicSettings(saved));
  } catch (err) { return error(res, err); }
});

app.get("/api/settings/audit", auth, requirePermission("audit.read"), async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const events = await SettingsAudit.find().sort({ changedAt: -1, _id: -1 }).limit(limit).lean();
    return reply(res, events);
  } catch (err) { return error(res, err); }
});

async function refreshProductRating(productId) {
  const [summary] = await Review.aggregate([{ $match: { productId: String(productId), status: "APPROVED" } }, { $group: { _id: null, average: { $avg: "$rating" } } }]);
  await Product.updateOne({ _id: productId }, { $set: { rating: summary ? Math.round(summary.average * 100) / 100 : 0 } });
}

app.get("/api/products/:id/reviews", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid product id" });
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 50);
    const filter = { productId: req.params.id, status: "APPROVED" };
    const [items, total] = await Promise.all([Review.find(filter).select("userName rating title body createdAt").sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), Review.countDocuments(filter)]);
    return res.json({ success: true, data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total } } });
  } catch (err) { return error(res, err); }
});

app.post("/api/products/:id/reviews", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid product id" });
    if (req.user.role !== "customer") return res.status(403).json({ success: false, message: "Only customer accounts can submit product reviews" });
    const rating = Number(req.body.rating);
    const title = String(req.body.title || "").trim();
    const body = String(req.body.body || "").trim();
    if (!Number.isInteger(rating) || rating < 1 || rating > 5 || title.length < 3 || title.length > 120 || body.length < 10 || body.length > 2000) return res.status(400).json({ success: false, message: "Provide a 1–5 rating, a 3–120 character title, and a 10–2,000 character review" });
    const product = await Product.findById(req.params.id).select("name").lean();
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    let ordersResponse;
    try {
      ordersResponse = await axios.get(`${process.env.ORDER_SERVICE_URL || "http://localhost:4005"}/api/orders?limit=100`, { headers: { Authorization: req.get("Authorization") }, timeout: 5000 });
    } catch { return res.status(503).json({ success: false, message: "Could not verify a completed purchase right now" }); }
    const ownsDeliveredItem = (ordersResponse.data?.data || []).some((order) => order.orderStatus === "DELIVERED" && order.items?.some((item) => String(item.productId) === String(product._id)));
    if (!ownsDeliveredItem) return res.status(403).json({ success: false, message: "A delivered purchase is required before reviewing this product" });
    const review = await Review.create({ productId: String(product._id), userId: String(req.user.id), userName: String(req.user.name || "Customer").trim().split(/\s+/)[0], rating, title, body, status: "PENDING" });
    return reply(res, review, 201);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: "You have already reviewed this product" });
    return error(res, err);
  }
});

app.post("/api/reviews/:id/report", auth, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid review id" });
    const reason = String(req.body.reason || "").trim();
    if (reason.length < 3 || reason.length > 500) return res.status(400).json({ success: false, message: "Report reason must be 3 to 500 characters" });
    const review = await Review.findOneAndUpdate({ _id: req.params.id, userId: { $ne: String(req.user.id) }, reportedBy: { $ne: String(req.user.id) } }, { $addToSet: { reportedBy: String(req.user.id) }, $push: { reports: { userId: String(req.user.id), reason, createdAt: new Date() } }, $inc: { reportCount: 1 } }, { new: true });
    if (!review) return res.status(404).json({ success: false, message: "Review was not found or was already reported" });
    return reply(res, { reportCount: review.reportCount, message: "Report submitted for review" });
  } catch (err) { return error(res, err); }
});

app.get("/api/reviews/admin", auth, requirePermission("reviews.moderate"), async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = {};
    if (req.query.status) {
      const status = String(req.query.status).toUpperCase();
      if (!["PENDING", "APPROVED", "HIDDEN", "REMOVED", "REPORTED"].includes(status)) return res.status(400).json({ success: false, message: "Invalid review status" });
      if (status === "REPORTED") filter.reportCount = { $gt: 0 }; else filter.status = status;
    }
    if (req.query.productId) filter.productId = String(req.query.productId);
    const [items, total] = await Promise.all([Review.find(filter).select("+reports").sort({ reportCount: -1, createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(), Review.countDocuments(filter)]);
    return res.json({ success: true, data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total } } });
  } catch (err) { return error(res, err); }
});

app.patch("/api/reviews/:id/moderation", auth, requirePermission("reviews.moderate"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid review id" });
    const status = String(req.body.status || "").toUpperCase();
    const reason = String(req.body.reason || "").trim();
    if (!["APPROVED", "HIDDEN", "REMOVED"].includes(status) || reason.length < 3 || reason.length > 500) return res.status(400).json({ success: false, message: "Choose a moderation action and enter a reason of 3 to 500 characters" });
    const review = await Review.findByIdAndUpdate(req.params.id, { $set: { status, moderationReason: reason, moderatedBy: String(req.user.id) }, $push: { moderationHistory: { status, reason, actorUserId: String(req.user.id), changedAt: new Date() } } }, { new: true, runValidators: true });
    if (!review) return res.status(404).json({ success: false, message: "Review not found" });
    await refreshProductRating(review.productId);
    return reply(res, review);
  } catch (err) { return error(res, err); }
});

const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const escapeXml = (value) => String(value ?? "").replace(/[<>&"']/g, (character) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[character]);
const encodeCursor = (product) => Buffer.from(JSON.stringify({ createdAt: product.createdAt.toISOString(), id: String(product._id) })).toString("base64url");
const decodeCursor = (cursor) => {
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    if (!decoded.createdAt || !mongoose.isValidObjectId(decoded.id) || Number.isNaN(Date.parse(decoded.createdAt))) throw new Error("bad cursor");
    return { createdAt: new Date(decoded.createdAt), id: new mongoose.Types.ObjectId(decoded.id) };
  } catch {
    const err = new Error("Invalid pagination cursor"); err.status = 400; throw err;
  }
};
const xmlTag = (value) => String(value).replace(/[^a-zA-Z0-9_.-]/g, "_") || "item";
const toXml = (value, tag = "item") => {
  const safeTag = xmlTag(tag);
  if (value === null || value === undefined) return `<${safeTag}/>`;
  if (Array.isArray(value)) return value.map((entry) => toXml(entry, "item")).join("");
  if (typeof value === "object") return `<${safeTag}>${Object.entries(value).map(([key, entry]) => toXml(entry, key)).join("")}</${safeTag}>`;
  return `<${safeTag}>${escapeXml(value)}</${safeTag}>`;
};
const asXml = (result) => `<?xml version="1.0" encoding="UTF-8"?>${toXml(result, "response")}`;
const SORT_FIELDS = new Set(["createdAt", "updatedAt", "name", "price", "rating", "stock"]);
const listing = async (req, res) => {
  try {
    const page = Number.parseInt(req.query.page, 10) || 1;
    const limit = Number.parseInt(req.query.limit, 10) || 20;
    if (page < 1 || limit < 1 || limit > 100) {
      return res.status(400).json({ success: false, message: "Page must be positive and limit must be between 1 and 100" });
    }

    const filter = { archivedAt: null };
    const search = String(req.query.q || req.query.search || "").trim();
    if (search) filter.name = { $regex: escapeRegex(search), $options: "i" };
    const category = req.params.category || req.query.category;
    if (category) filter.category = String(category).trim();
    if (req.query.brand) filter.brand = String(req.query.brand).trim();

    const price = {};
    for (const [key, operator] of [["minPrice", "$gte"], ["maxPrice", "$lte"]]) {
      if (req.query[key] !== undefined) {
        const value = Number(req.query[key]);
        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({ success: false, message: `${key} must be a non-negative number` });
        }
        price[operator] = value;
      }
    }
    if (price.$gte !== undefined && price.$lte !== undefined && price.$gte > price.$lte) {
      return res.status(400).json({ success: false, message: "minPrice cannot exceed maxPrice" });
    }
    if (Object.keys(price).length) filter.price = price;
    if (req.query.inStock === "true") filter.stock = { $gt: 0 };
    if (req.query.inStock === "false") filter.stock = 0;

    const sortField = SORT_FIELDS.has(req.query.sort) ? req.query.sort : "createdAt";
    const sortOrder = req.query.order === "asc" ? 1 : -1;
    if (req.query.after && (sortField !== "createdAt" || sortOrder !== -1)) {
      return res.status(400).json({ success: false, message: "Cursor pagination currently uses the default createdAt descending sort" });
    }
    let cursor;
    if (req.query.after) {
      cursor = decodeCursor(String(req.query.after));
      filter.$or = [
        { createdAt: { $lt: cursor.createdAt } },
        { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
      ];
    }
    const rows = await Product.find(filter)
      .sort({ [sortField]: sortOrder, _id: sortField === "createdAt" ? sortOrder : 1 })
      .skip(req.query.after ? 0 : (page - 1) * limit)
      .limit(limit + 1);
    const hasNext = rows.length > limit;
    const items = hasNext ? rows.slice(0, limit) : rows;
    const nextCursor = sortField === "createdAt" && sortOrder === -1 && hasNext && items.length ? encodeCursor(items[items.length - 1]) : null;
    const total = req.query.after ? undefined : await Product.countDocuments(filter);
    const url = new URL(`${req.protocol}://${req.get("host")}${req.originalUrl}`);
    if (nextCursor) url.searchParams.set("after", nextCursor);
    else url.searchParams.delete("after");
    const next = nextCursor ? `${url.pathname}${url.search}` : null;
    const body = {
      success: true,
      data: { items, pagination: { limit, ...(total === undefined ? {} : { total }), ...(total === undefined ? {} : { pages: Math.ceil(total / limit) }), hasNext, nextCursor }, links: { next } },
    };
    res.vary("Accept");
    if (next) res.set("Link", `<${next}>; rel="next"`);
    if (req.accepts(["json", "xml"]) === "xml") return res.type("application/xml").send(asXml(body));
    return res.json(body);
  } catch (err) {
    return error(res, err);
  }
};

app.get("/api/products", listing);
app.get("/api/products/search", listing);
app.get("/api/products/category/:category", listing);

app.get("/api/products/categories", async (req, res) => {
  try {
    res.vary("Accept");
    const categories = await Product.aggregate([
      { $match: { archivedAt: null } },
      { $group: { _id: "$category", productCount: { $sum: 1 } } },
      { $sort: { _id: 1 } },
      { $project: { _id: 0, name: "$_id", productCount: 1 } },
    ]);
    if (req.accepts(["json", "xml"]) === "xml") return res.type("application/xml").send(asXml({ success: true, data: categories }));
    return reply(res, categories);
  } catch (err) {
    return error(res, err);
  }
});

app.get("/api/products/brands", async (req, res) => {
  try {
    const brands = await Product.aggregate([
      { $match: { brand: { $type: "string", $ne: "" }, archivedAt: null } },
      { $group: { _id: "$brand", productCount: { $sum: 1 } } },
      { $sort: { _id: 1 } }, { $limit: 500 },
    ]);
    return reply(res, brands.map((brand) => ({ name: brand._id, productCount: brand.productCount })));
  } catch (err) { return error(res, err); }
});

app.get("/api/products/:id/inventory-movements", auth, requirePermission("inventory.read"), async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid product id" });
    const product = await Product.findById(req.params.id).select("+stockHistory").lean();
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    return reply(res, (product.stockHistory || []).slice(-100).reverse());
  } catch (err) { return error(res, err); }
});

app.get("/api/products/admin", auth, requirePermission("products.write"), async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = {};
    if (req.query.archived === "true") filter.archivedAt = { $ne: null };
    else if (req.query.archived !== "all") filter.archivedAt = null;
    const search = String(req.query.search || "").trim();
    if (search) {
      const escaped = escapeRegex(search);
      filter.$or = [{ name: { $regex: escaped, $options: "i" } }, { sku: { $regex: escaped, $options: "i" } }, { category: { $regex: escaped, $options: "i" } }, { brand: { $regex: escaped, $options: "i" } }];
    }
    if (req.query.category) filter.category = String(req.query.category);
    if (req.query.brand) filter.brand = String(req.query.brand);
    const sortField = String(req.query.sort || "updatedAt");
    const sortOrder = String(req.query.order || "desc").toLowerCase();
    if (!["name", "price", "stock", "updatedAt"].includes(sortField) || !["asc", "desc"].includes(sortOrder)) return res.status(400).json({ success: false, message: "Invalid product sort" });
    const sort = { [sortField]: sortOrder === "asc" ? 1 : -1, _id: 1 };
    const [items, total] = await Promise.all([
      Product.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter),
    ]);
    return res.json({ success: true, data: { items, pagination: { page, limit, total, pages: Math.ceil(total / limit) } } });
  } catch (err) { return error(res, err); }
});

app.get("/api/products/admin/inventory-summary", auth, requirePermission("inventory.read"), async (req, res) => {
  try {
    const configured = await StoreSettings.findById("store").select("lowStockThreshold").lean();
    const environmentThreshold = Number(process.env.LOW_STOCK_THRESHOLD);
    const threshold = configured?.lowStockThreshold ?? (Number.isFinite(environmentThreshold) ? Math.max(0, environmentThreshold) : 5);
    const [totalProducts, lowStock, outOfStock] = await Promise.all([
      Product.countDocuments(),
      Product.countDocuments({ stock: { $gt: 0, $lte: threshold } }),
      Product.countDocuments({ stock: 0 }),
    ]);
    return reply(res, { totalProducts, lowStock, outOfStock, lowStockThreshold: threshold });
  } catch (err) { return error(res, err); }
});

app.get("/api/products/admin/report", auth, requirePermission("analytics.read"), async (req, res) => {
  try {
    const dateRange = {};
    for (const [key, operator] of [["from", "$gte"], ["to", "$lte"]]) {
      if (!req.query[key]) continue;
      const date = new Date(String(req.query[key]));
      if (Number.isNaN(date.valueOf())) return res.status(400).json({ success: false, message: `Invalid ${key} date` });
      dateRange[operator] = date;
    }
    if (dateRange.$gte && dateRange.$lte && dateRange.$gte > dateRange.$lte) return res.status(400).json({ success: false, message: "from date must be before to date" });
    const filter = req.query.archived === "true" ? { archivedAt: { $ne: null } } : req.query.archived === "all" ? {} : { archivedAt: null };
    if (Object.keys(dateRange).length) filter.createdAt = dateRange;
    for (const field of ["category", "brand"]) if (req.query[field]) filter[field] = String(req.query[field]).slice(0, 100);
    const search = String(req.query.search || "").trim();
    if (search.length > 100) return res.status(400).json({ success: false, message: "Search must be 100 characters or fewer" });
    if (search) {
      const escaped = escapeRegex(search);
      filter.$or = [{ name: { $regex: escaped, $options: "i" } }, { sku: { $regex: escaped, $options: "i" } }, { category: { $regex: escaped, $options: "i" } }, { brand: { $regex: escaped, $options: "i" } }];
    }
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const csv = String(req.query.format || "").toLowerCase() === "csv";
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), csv ? 1000 : 100);
    const settings = await StoreSettings.findById("store").select("lowStockThreshold").lean();
    const rawThreshold = Number(process.env.LOW_STOCK_THRESHOLD);
    const threshold = settings?.lowStockThreshold ?? (Number.isFinite(rawThreshold) ? Math.max(0, rawThreshold) : 5);
    const [items, total, lowStock, outOfStock] = await Promise.all([
      Product.find(filter).select("name sku category brand price stock archivedAt createdAt updatedAt").sort({ updatedAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Product.countDocuments(filter),
      Product.countDocuments({ ...filter, stock: { $gt: 0, $lte: threshold } }),
      Product.countDocuments({ ...filter, stock: 0 }),
    ]);
    const summary = { totalProducts: total, lowStock, outOfStock, lowStockThreshold: threshold };
    if (csv) {
      const cell = (value) => {
        let text = String(value ?? "");
        if (/^\s*[=+@\-]/.test(text)) text = `'${text}`;
        return `"${text.replace(/"/g, '""')}"`;
      };
      const columns = ["product_id", "name", "sku", "category", "brand", "price", "stock", "archived", "created_at", "updated_at"];
      const rows = items.map((item) => [item._id, item.name, item.sku, item.category, item.brand, item.price, item.stock, Boolean(item.archivedAt), item.createdAt?.toISOString(), item.updatedAt?.toISOString()].map(cell).join(","));
      await ProductAuditEvent.create({ actorUserId: String(req.user.id), action: "report.inventory.exported", metadata: { from: dateRange.$gte || null, to: dateRange.$lte || null, archived: req.query.archived || "active", page, limit, rowCount: items.length } });
      res.set("Content-Type", "text/csv; charset=utf-8");
      res.set("Content-Disposition", `attachment; filename="smartcart-inventory-page-${page}.csv"`);
      return res.status(200).send([columns.join(","), ...rows].join("\r\n"));
    }
    return reply(res, { items, summary, pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total } });
  } catch (err) { return error(res, err); }
});

app.get("/api/products/admin/audit", auth, requirePermission("audit.read"), async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    const events = await ProductAuditEvent.find().sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
    return reply(res, events);
  } catch (err) { return error(res, err); }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    res.vary("Accept");
    const product = await Product.findOne({ _id: req.params.id, archivedAt: null });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    if (req.accepts(["json", "xml"]) === "xml") return res.type("application/xml").send(asXml({ success: true, data: product }));
    return reply(res, product);
  } catch (err) {
    return error(res, err);
  }
});

const writableFields = ["name", "sku", "description", "price", "category", "brand", "images", "stock", "rating", "specifications"];
const pickProductFields = (body) => {
  const fields = Object.fromEntries(writableFields.filter((field) => Object.hasOwn(body, field)).map((field) => [field, body[field]]));
  if (typeof fields.sku === "string") fields.sku = fields.sku.trim().toUpperCase() || undefined;
  return fields;
};
const safeImageUrls = (images) => Array.isArray(images) && images.every((image) => {
  if (typeof image !== "string" || image.length > 2048) return false;
  try { return new URL(image).protocol === "https:"; } catch { return false; }
});

function validInternalInventoryRequest(req) {
  const expected = process.env.INVENTORY_SERVICE_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-inventory-service-secret-change-me");
  const received = req.get("X-Inventory-Service-Secret") || "";
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length >= 32 && expectedBuffer.length === receivedBuffer.length && require("crypto").timingSafeEqual(expectedBuffer, receivedBuffer);
}

app.post("/internal/inventory/reservations", async (req, res) => {
  if (!validInternalInventoryRequest(req)) return res.status(401).json({ success: false, message: "Authentication required" });
  const orderId = String(req.body.orderId || "");
  const rawItems = req.body.items;
  if (!orderId || orderId.length > 100 || !Array.isArray(rawItems) || rawItems.length < 1 || rawItems.length > 50) return res.status(400).json({ success: false, message: "A valid orderId and 1 to 50 items are required" });
  const quantities = new Map();
  for (const item of rawItems) {
    const productId = String(item.productId || "");
    const quantity = Number(item.quantity);
    if (!mongoose.isValidObjectId(productId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return res.status(400).json({ success: false, message: "Each reservation item needs a valid productId and positive integer quantity" });
    quantities.set(productId, (quantities.get(productId) || 0) + quantity);
  }
  if ([...quantities.values()].some((quantity) => quantity > 1000)) return res.status(400).json({ success: false, message: "Requested product quantity is too large" });

  const reserved = [];
  try {
    for (const [productId, quantity] of quantities) {
      const existing = await Product.findOne({ _id: productId, "stockReservations.orderId": orderId }).select("+stockReservations").lean();
      if (existing) {
        const prior = existing.stockReservations.find((reservation) => reservation.orderId === orderId);
        if (prior.quantity !== quantity) throw Object.assign(new Error("Order reservation was already created with different quantities"), { status: 409 });
        continue;
      }
      const product = await Product.findOneAndUpdate(
        { _id: productId, archivedAt: null, stock: { $gte: quantity }, stockReservations: { $not: { $elemMatch: { orderId } } } },
        {
          $inc: { stock: -quantity },
          $push: {
            stockReservations: { orderId, quantity, reservedAt: new Date() },
          },
        },
        { new: true },
      );
      if (!product) {
        const afterRace = await Product.findOne({ _id: productId, "stockReservations.orderId": orderId }).select("+stockReservations").lean();
        const prior = afterRace?.stockReservations.find((reservation) => reservation.orderId === orderId);
        if (prior?.quantity === quantity) continue;
        const exists = await Product.exists({ _id: productId });
        throw Object.assign(new Error(!exists ? "Product was not found" : "Insufficient stock or product unavailable"), { status: !exists ? 404 : 409 });
      }
      reserved.push({ productId, quantity });
      await appendInventoryEvent(productId, { actorUserId: "order-service", previousStock: product.stock + quantity, newStock: product.stock, reason: `Reserved ${quantity} units for order ${orderId}`, changedAt: new Date() });
    }
    return reply(res, { orderId, reserved: [...quantities].map(([productId, quantity]) => ({ productId, quantity })) }, 201);
  } catch (err) {
    for (const reservation of reserved.reverse()) {
      const product = await Product.findOneAndUpdate(
        { _id: reservation.productId, "stockReservations.orderId": orderId },
        { $inc: { stock: reservation.quantity }, $pull: { stockReservations: { orderId } } }, { new: true },
      ).catch(() => undefined);
      if (product) await appendInventoryEvent(product._id, { actorUserId: "order-service", previousStock: product.stock - reservation.quantity, newStock: product.stock, reason: `Rolled back reservation for order ${orderId}`, changedAt: new Date() });
    }
    return res.status(err.status || 500).json({ success: false, message: err.status ? err.message : "Inventory reservation failed" });
  }
});

app.post("/internal/inventory/reservations/:orderId/release", async (req, res) => {
  if (!validInternalInventoryRequest(req)) return res.status(401).json({ success: false, message: "Authentication required" });
  const orderId = String(req.params.orderId || "");
  if (!orderId || orderId.length > 100) return res.status(400).json({ success: false, message: "Invalid orderId" });
  try {
    const products = await Product.find({ "stockReservations.orderId": orderId }).select("+stockReservations").lean();
    let released = 0;
    for (const product of products) {
      const reservation = product.stockReservations.find((entry) => entry.orderId === orderId);
      if (!reservation) continue;
      const updated = await Product.findOneAndUpdate(
        { _id: product._id, "stockReservations.orderId": orderId },
        {
          $inc: { stock: reservation.quantity },
          $pull: { stockReservations: { orderId } },
        },
        { new: true },
      );
      if (updated) {
        released += 1;
        await appendInventoryEvent(updated._id, { actorUserId: "order-service", previousStock: updated.stock - reservation.quantity, newStock: updated.stock, reason: `Released reservation for order ${orderId}`, changedAt: new Date() });
      }
    }
    return reply(res, { orderId, releasedProducts: released });
  } catch (err) { return error(res, err); }
});

app.post("/internal/inventory/reservations/:orderId/commit", async (req, res) => {
  if (!validInternalInventoryRequest(req)) return res.status(401).json({ success: false, message: "Authentication required" });
  const orderId = String(req.params.orderId || "");
  if (!orderId || orderId.length > 100) return res.status(400).json({ success: false, message: "Invalid orderId" });
  try {
    const products = await Product.find({ "stockReservations.orderId": orderId }).select("+stockReservations").lean();
    let committed = 0;
    for (const product of products) {
      const reservation = product.stockReservations.find((entry) => entry.orderId === orderId);
      if (!reservation) continue;
      const result = await Product.updateOne({ _id: product._id, "stockReservations.orderId": orderId }, { $pull: { stockReservations: { orderId } } });
      if (result.modifiedCount) {
        committed += 1;
        await appendInventoryEvent(product._id, { actorUserId: "order-service", previousStock: product.stock, newStock: product.stock, reason: `Committed reservation for order ${orderId}`, changedAt: new Date() });
      }
    }
    return reply(res, { orderId, committedProducts: committed });
  } catch (err) { return error(res, err); }
});

app.post("/api/products", guard, async (req, res) => {
  try {
    if (req.body.images !== undefined && !safeImageUrls(req.body.images)) return res.status(400).json({ success: false, message: "Product images must be HTTPS URLs under 2048 characters" });
    const fields = pickProductFields(req.body);
    if (Number(fields.stock) > 0) fields.stockHistory = [{ actorUserId: req.user.id, previousStock: 0, newStock: Number(fields.stock), reason: "Initial product stock", changedAt: new Date() }];
    const product = await Product.create(fields);
    product.stockHistory = undefined;
    return reply(res, product, 201);
  } catch (err) {
    return error(res, err);
  }
});

app.put("/api/products/:id", guard, async (req, res) => {
  try {
    if (req.body.images !== undefined && !safeImageUrls(req.body.images)) return res.status(400).json({ success: false, message: "Product images must be HTTPS URLs under 2048 characters" });
    const before = await Product.findById(req.params.id);
    if (!before) return res.status(404).json({ success: false, message: "Product not found" });
    const fields = pickProductFields(req.body);
    if (fields.stock !== undefined && fields.stock !== before.stock && String(req.body.stockAdjustmentReason || "").trim().length < 3) return res.status(400).json({ success: false, message: "A reason is required when changing product stock" });
    const update = { $set: fields };
    if (fields.stock !== undefined && fields.stock !== before.stock) update.$push = { stockHistory: { $each: [{ actorUserId: req.user.id, previousStock: before.stock, newStock: fields.stock, reason: String(req.body.stockAdjustmentReason).trim(), changedAt: new Date() }], $slice: -1000 } };
    const product = await Product.findOneAndUpdate({ _id: req.params.id, stock: before.stock }, update, { new: true, runValidators: true });
    if (!product) return res.status(409).json({ success: false, message: "Product changed while you were editing it. Reload and try again." });
    return reply(res, product);
  } catch (err) {
    return error(res, err);
  }
});

app.delete("/api/products/:id", guard, async (req, res) => {
  try {
    const product = await Product.findOneAndUpdate({ _id: req.params.id, archivedAt: null }, { archivedAt: new Date() }, { new: true });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    return reply(res, product);
  } catch (err) {
    return error(res, err);
  }
});

app.patch("/api/products/:id/archive", guard, async (req, res) => {
  try {
    const archived = req.body.archived;
    if (typeof archived !== "boolean") return res.status(400).json({ success: false, message: "archived must be a boolean" });
    const product = await Product.findByIdAndUpdate(req.params.id, { archivedAt: archived ? new Date() : null }, { new: true, runValidators: true });
    if (!product) return res.status(404).json({ success: false, message: "Product not found" });
    return reply(res, product);
  } catch (err) { return error(res, err); }
});

app.patch("/api/products/:id/stock", inventoryWrite, async (req, res) => {
  const stock = Number(req.body.stock);
  const reason = String(req.body.reason || "").trim();
  if (!Number.isInteger(stock) || stock < 0 || reason.length < 3 || reason.length > 500) {
    return res.status(400).json({ success: false, message: "Stock must be a non-negative integer and an adjustment reason is required" });
  }
  try {
    const before = await Product.findById(req.params.id);
    if (!before) return res.status(404).json({ success: false, message: "Product not found" });
    const product = await Product.findOneAndUpdate({ _id: req.params.id, stock: before.stock }, { $set: { stock }, $push: { stockHistory: { $each: [{ actorUserId: req.user.id, previousStock: before.stock, newStock: stock, reason, changedAt: new Date() }], $slice: -1000 } } }, { new: true, runValidators: true });
    if (!product) return res.status(409).json({ success: false, message: "Product stock changed concurrently. Reload and try again." });
    return reply(res, product);
  } catch (err) {
    return error(res, err);
  }
});

app.use((err, req, res, next) => {
  if (err instanceof SyntaxError && Object.hasOwn(err, "body")) {
    return res.status(400).json({ success: false, message: "Invalid JSON", requestId: res.getHeader("X-Request-Id") || req.requestId });
  }
  return error(res, err);
});

const port = Number(process.env.PORT) || 4002;
if (process.env.NODE_ENV === "production" && (!process.env.INVENTORY_SERVICE_SECRET || process.env.INVENTORY_SERVICE_SECRET.length < 32 || /change-me|replace-with|local-development/i.test(process.env.INVENTORY_SERVICE_SECRET))) {
  console.error("A strong INVENTORY_SERVICE_SECRET is required in production");
  process.exit(1);
}
mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017", {
  dbName: process.env.MONGODB_DB || "smartcart_product",
}).then(() => {
  app.listen(port, () => console.log(`product-service listening on ${port}`));
}).catch((err) => {
  console.error("MongoDB connection failed", err.message);
  process.exit(1);
});
