require("dotenv").config();
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const axios = require("axios");
const cors = require("cors");
const crypto = require("crypto");
const express = require("express");
const mongoose = require("mongoose");
const { calculateCouponQuote, couponError } = require("./promotion-rules");

const app = express();
const Schema = mongoose.Schema;
const ORDER_STATUSES = [
    "PENDING",
    "CONFIRMED",
    "SHIPPED",
    "DELIVERED",
    "CANCELLED",
    "RETURNED",
];

const ALLOWED_TRANSITIONS = {
    PENDING: ["CONFIRMED", "CANCELLED"],
    CONFIRMED: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["DELIVERED"],
    DELIVERED: [],
    CANCELLED: [],
    RETURNED: [],
};

const orderItemSchema = new Schema(
    {
        productId: { type: String, required: true },
        name: { type: String, required: true, trim: true },
        category: { type: String, required: true, trim: true },
        price: { type: Number, required: true, min: 0 },
        quantity: { type: Number, required: true, min: 1 },
    },
    { _id: false },
);

const statusEventSchema = new Schema(
    {
        status: { type: String, enum: ORDER_STATUSES, required: true },
        note: { type: String, trim: true, maxlength: 500, default: "" },
        changedBy: { type: String, required: true },
        changedAt: { type: Date, default: Date.now },
    },
    { _id: false },
);
const returnHistorySchema = new Schema({
    status: { type: String, enum: ["REQUESTED", "APPROVED", "REJECTED", "COMPLETED"], required: true },
    note: { type: String, trim: true, maxlength: 500, default: "" },
    changedBy: { type: String, required: true },
    changedAt: { type: Date, default: Date.now },
}, { _id: false });

const orderSchema = new Schema(
    {
        userId: { type: String, required: true, index: true },
        items: { type: [orderItemSchema], required: true },
        shippingAddress: { type: Schema.Types.Mixed, default: {} },
        totalAmount: { type: Number, required: true, min: 0 },
        subtotalAmount: { type: Number, min: 0, default: null },
        discountAmount: { type: Number, min: 0, default: 0 },
        taxAmount: { type: Number, min: 0, default: 0 },
        shippingAmount: { type: Number, min: 0, default: 0 },
        currency: { type: String, enum: ["INR", "USD", "EUR"], default: "INR" },
        couponCode: { type: String, trim: true, uppercase: true, default: null },
        couponId: { type: Schema.Types.ObjectId, default: null },
        paymentId: { type: String, default: null },
        paymentMethod: { type: String, enum: ["UPI", "CARD", "COD"], default: "UPI" },
        paymentCheckout: { type: Schema.Types.Mixed, default: null },
        paymentStatus: {
            type: String,
            enum: ["PENDING", "SUCCESS", "FAILED", "REFUNDED"],
            default: "PENDING",
        },
        orderStatus: {
            type: String,
            enum: ORDER_STATUSES,
            default: "PENDING",
        },
        statusHistory: { type: [statusEventSchema], default: [] },
        returnRequest: {
            status: { type: String, enum: ["NONE", "REQUESTED", "APPROVED", "REJECTED", "COMPLETED"], default: "NONE" },
            reason: { type: String, trim: true, maxlength: 500, default: "" },
            requestedBy: { type: String, default: null },
            requestedAt: { type: Date, default: null },
            reviewedBy: { type: String, default: null },
            reviewedAt: { type: Date, default: null },
            reviewNote: { type: String, trim: true, maxlength: 500, default: "" },
            completedBy: { type: String, default: null },
            completedAt: { type: Date, default: null },
        },
        returnHistory: { type: [returnHistorySchema], default: [] },
        shipment: {
            carrier: { type: String, trim: true, default: null },
            trackingNumber: { type: String, trim: true, default: null },
            trackingUrl: { type: String, trim: true, default: null },
            shippedAt: { type: Date, default: null },
            deliveredAt: { type: Date, default: null },
        },
    },
    { timestamps: true },
);

orderSchema.index({ userId: 1, createdAt: -1 });
orderSchema.index({ createdAt: -1 });
const Order = mongoose.models.Order || mongoose.model("Order", orderSchema);

const couponUsageSchema = new Schema({
    orderId: { type: String, required: true },
    userId: { type: String, required: true },
    discountAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["RESERVED", "REDEEMED"], default: "RESERVED" },
    createdAt: { type: Date, default: Date.now },
}, { _id: false });
const Coupon = mongoose.models.Coupon || mongoose.model("Coupon", new Schema({
    code: { type: String, required: true, uppercase: true, trim: true, unique: true, maxlength: 32 },
    description: { type: String, trim: true, maxlength: 300, default: "" },
    discountType: { type: String, enum: ["PERCENTAGE", "FIXED"], required: true },
    discountValue: { type: Number, required: true, min: 0.01 },
    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },
    minCartValue: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, default: null, min: 0 },
    usageLimit: { type: Number, required: true, min: 1, max: 10000 },
    perCustomerLimit: { type: Number, required: true, min: 1, max: 10000 },
    productIds: { type: [String], default: [] },
    categories: { type: [String], default: [] },
    status: { type: String, enum: ["DRAFT", "ACTIVE", "INACTIVE"], default: "DRAFT", index: true },
    usageRecords: { type: [couponUsageSchema], default: [], select: false },
    createdBy: { type: String, default: null },
    updatedBy: { type: String, default: null },
}, { timestamps: true }));
Coupon.schema.index({ status: 1, startsAt: 1, endsAt: 1 });
const BusinessAudit = mongoose.models.BusinessAudit || mongoose.model("BusinessAudit", new Schema({
    actorUserId: { type: String, required: true },
    action: { type: String, required: true, index: true },
    targetId: { type: String, default: null },
    metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: { createdAt: true, updatedAt: false } }));
BusinessAudit.schema.index({ createdAt: -1, _id: -1 });

app.use(cors({ origin: (process.env.CORS_ORIGIN || "http://localhost:3000").split(",").map((value) => value.trim()), credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => {
    req.requestId = req.get("X-Request-Id") || crypto.randomUUID();
    res.set("X-Request-Id", req.requestId);
    if (req.method === "GET" || req.method === "HEAD") res.set("Cache-Control", req.path === "/health" ? "no-store" : "private, no-cache");
    next();
});

const escapeXml = (value) => String(value ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
const xmlTag = (value) => String(value).replace(/[^a-zA-Z0-9_.-]/g, "_") || "item";
const toXml = (value, tag = "item") => {
    const safeTag = xmlTag(tag);
    if (value === null || value === undefined) return `<${safeTag}/>`;
    if (Array.isArray(value)) return value.map((entry) => toXml(entry, "item")).join("");
    if (typeof value === "object") return `<${safeTag}>${Object.entries(value).map(([key, entry]) => toXml(entry, key)).join("")}</${safeTag}>`;
    return `<${safeTag}>${escapeXml(value)}</${safeTag}>`;
};
const asXml = (result) => `<?xml version="1.0" encoding="UTF-8"?>${toXml(result, "response")}`;

function sendData(res, data, statusCode = 200) {
    res.vary("Accept");
    if (res.req && res.req.accepts && res.req.accepts(["json", "xml"]) === "xml") {
        return res.status(statusCode).type("application/xml").send(asXml({ success: true, data }));
    }
    return res.status(statusCode).json({ success: true, data });
}

function sendError(res, error) {
    let statusCode = error.statusCode || 500;
    if (error.name === "ValidationError" || error.name === "CastError") {
        statusCode = 400;
    }
    const message = statusCode >= 500 ? "Internal server error" : error.message;
    return res.status(statusCode).json({ success: false, message, requestId: res.getHeader("X-Request-Id") || (res.req && res.req.requestId) });
}

async function authenticate(req, res, next) {
    const authorization = req.get("Authorization") || "";
    try {
        if (!/^Bearer\s+\S+$/i.test(authorization)) return res.status(401).json({ success: false, message: "Authentication required" });
        const response = await fetch(`${process.env.AUTH_SERVICE_URL || "http://localhost:4001"}/api/auth/session`, {
            headers: { Authorization: authorization }, signal: AbortSignal.timeout(3000),
        });
        if (!response.ok) return res.status(response.status === 401 ? 401 : 503).json({ success: false, message: response.status === 401 ? "Authentication required" : "Authentication service unavailable" });
        req.user = (await response.json()).data.user;
        req.user.userId = req.user.id;
        return next();
    } catch {
        return res.status(503).json({ success: false, message: "Authentication service unavailable" });
    }
}

function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user.permissions?.includes(permission)) {
        return res.status(403).json({
            success: false,
            message: "Insufficient permissions",
        });
    }
    return next();
  };
}

function canViewOrder(order, user) {
    return order.userId === user.userId || user.permissions?.includes("orders.read_all");
}

function parsePagination(query) {
    const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 100);
    return { page, limit };
}

function decodeOrderCursor(value) {
    try {
        const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
        if (!cursor.createdAt || !mongoose.isValidObjectId(cursor.id) || Number.isNaN(Date.parse(cursor.createdAt))) throw new Error("Invalid cursor");
        return { createdAt: new Date(cursor.createdAt), id: new mongoose.Types.ObjectId(cursor.id) };
    } catch {
        const error = new Error("Invalid pagination cursor");
        error.statusCode = 400;
        throw error;
    }
}

const encodeOrderCursor = (order) => Buffer.from(JSON.stringify({ createdAt: order.createdAt.toISOString(), id: String(order._id) })).toString("base64url");

function getProductServiceUrl() {
    return process.env.PRODUCT_SERVICE_URL || "http://localhost:4002";
}

async function loadOrderItems(items) {
    if (!Array.isArray(items) || items.length === 0) {
        const error = new Error("Order items are required");
        error.statusCode = 400;
        throw error;
    }

    if (items.length > 50) {
        const error = new Error("An order cannot contain more than 50 line items");
        error.statusCode = 400;
        throw error;
    }

    return Promise.all(
        items.map(async (item) => {
            const quantity = Number(item.quantity);
            if (!item.productId || !Number.isInteger(quantity) || quantity < 1) {
                const error = new Error("Each item needs a productId and positive integer quantity");
                error.statusCode = 400;
                throw error;
            }

            const response = await axios.get(
                `${getProductServiceUrl()}/api/products/${encodeURIComponent(item.productId)}`,
                { timeout: 5000 },
            );
            const product = response.data?.data;

            if (!product) {
                const error = new Error("Product was not found");
                error.statusCode = 404;
                throw error;
            }

            return {
                productId: String(product._id),
                name: product.name,
                category: product.category,
                price: product.price,
                quantity,
            };
        }),
    );
}

const normalizeCouponCode = (value) => String(value || "").trim().toUpperCase();

async function getCouponQuote(code, items, userId) {
    const normalized = normalizeCouponCode(code);
    if (!/^[A-Z0-9_-]{3,32}$/.test(normalized)) throw couponError("Enter a valid coupon code");
    const coupon = await Coupon.findOne({ code: normalized }).select("+usageRecords");
    if (!coupon) throw couponError("This coupon is invalid or inactive", 400);
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return calculateCouponQuote(coupon, items, subtotal, userId);
}

async function loadStorePricingSettings() {
    try {
        const response = await axios.get(`${getProductServiceUrl()}/api/settings/public`, { timeout: 4000 });
        const settings = response.data?.data;
        if (!settings || settings.currency !== (process.env.PAYMENT_CURRENCY || "INR")) throw couponError("Store currency must match the configured payment currency", 503);
        return {
            currency: settings.currency,
            taxRate: Number(settings.taxRate) || 0,
            shippingFee: Number(settings.shippingFee) || 0,
            freeShippingThreshold: Number(settings.freeShippingThreshold) || 0,
        };
    } catch (error) {
        if (error.statusCode) throw error;
        throw couponError("Store pricing settings are unavailable", 503);
    }
}

function calculateOrderAmounts(subtotal, discountAmount, settings) {
    const round = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
    const discountedSubtotal = round(Math.max(0, subtotal - discountAmount));
    const taxAmount = round(discountedSubtotal * settings.taxRate / 100);
    const shippingAmount = settings.freeShippingThreshold > 0 && discountedSubtotal >= settings.freeShippingThreshold ? 0 : round(settings.shippingFee);
    return { taxAmount, shippingAmount, totalAmount: round(discountedSubtotal + taxAmount + shippingAmount), currency: settings.currency };
}

async function reserveCoupon(quote, orderId, userId) {
    if (!quote) return;
    const existing = await Coupon.findOne({ _id: quote.couponId, "usageRecords.orderId": String(orderId) }).select("+usageRecords").lean();
    if (existing) {
        const prior = existing.usageRecords.find((usage) => usage.orderId === String(orderId));
        if (prior.userId !== String(userId) || prior.discountAmount !== quote.discountAmount) throw couponError("Coupon reservation does not match this order", 409);
        return;
    }
    const now = new Date();
    const records = { $ifNull: ["$usageRecords", []] };
    const customerUsage = { $size: { $filter: { input: records, as: "usage", cond: { $eq: ["$$usage.userId", String(userId)] } } } };
    const reserved = await Coupon.findOneAndUpdate({
        _id: quote.couponId,
        code: quote.code,
        status: "ACTIVE",
        startsAt: { $lte: now },
        endsAt: { $gt: now },
        discountType: quote.coupon.discountType,
        discountValue: quote.coupon.discountValue,
        minCartValue: quote.coupon.minCartValue,
        maxDiscount: quote.coupon.maxDiscount,
        usageLimit: quote.coupon.usageLimit,
        perCustomerLimit: quote.coupon.perCustomerLimit,
        productIds: quote.coupon.productIds,
        categories: quote.coupon.categories,
        "usageRecords.orderId": { $ne: String(orderId) },
        $expr: { $and: [
            { $lt: [{ $size: records }, "$usageLimit"] },
            { $lt: [customerUsage, "$perCustomerLimit"] },
        ] },
    }, { $push: { usageRecords: { orderId: String(orderId), userId: String(userId), discountAmount: quote.discountAmount, status: "RESERVED", createdAt: now } } }, { new: true });
    if (!reserved) throw couponError("This coupon was just used or changed. Review your cart and try again", 409);
}

async function releaseCoupon(orderId) {
    await Coupon.updateOne({ "usageRecords.orderId": String(orderId) }, { $pull: { usageRecords: { orderId: String(orderId) } } });
}

async function commitCoupon(orderId) {
    await Coupon.updateOne({ "usageRecords.orderId": String(orderId), "usageRecords.status": "RESERVED" }, { $set: { "usageRecords.$.status": "REDEEMED" } });
}

function normalizeCouponInput(body, existingUsageCount = 0) {
    const code = normalizeCouponCode(body.code);
    const discountType = String(body.discountType || "").toUpperCase();
    const discountValue = Number(body.discountValue);
    const startsAt = new Date(body.startsAt);
    const endsAt = new Date(body.endsAt);
    const minCartValue = Number(body.minCartValue ?? 0);
    const maxDiscount = body.maxDiscount === "" || body.maxDiscount === null || body.maxDiscount === undefined ? null : Number(body.maxDiscount);
    const usageLimit = Number(body.usageLimit);
    const perCustomerLimit = Number(body.perCustomerLimit);
    const status = String(body.status || "DRAFT").toUpperCase();
    const productIds = Array.isArray(body.productIds) ? [...new Set(body.productIds.map(String))] : [];
    const categories = Array.isArray(body.categories) ? [...new Set(body.categories.map((category) => String(category).trim()).filter(Boolean))] : [];
    if (!/^[A-Z0-9_-]{3,32}$/.test(code)) throw couponError("Coupon code must use 3 to 32 letters, numbers, underscores, or hyphens");
    if (!["PERCENTAGE", "FIXED"].includes(discountType) || !Number.isFinite(discountValue) || discountValue <= 0 || (discountType === "PERCENTAGE" && discountValue > 100)) throw couponError("Enter a valid percentage or fixed discount value");
    if (Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf()) || startsAt >= endsAt) throw couponError("Coupon end date must be after its start date");
    if (!Number.isFinite(minCartValue) || minCartValue < 0 || (maxDiscount !== null && (!Number.isFinite(maxDiscount) || maxDiscount < 0))) throw couponError("Cart minimum and maximum discount must be non-negative numbers");
    if (!Number.isInteger(usageLimit) || usageLimit < 1 || usageLimit > 10000 || usageLimit < existingUsageCount) throw couponError("Usage limit must be 1 to 10,000 and cannot be lower than usage already recorded");
    if (!Number.isInteger(perCustomerLimit) || perCustomerLimit < 1 || perCustomerLimit > usageLimit) throw couponError("Per-customer limit must be at least 1 and no greater than the total usage limit");
    if (!Array.isArray(body.productIds ?? []) || productIds.length > 100 || productIds.some((id) => !mongoose.isValidObjectId(id))) throw couponError("Product applicability must contain up to 100 valid product IDs");
    if (!Array.isArray(body.categories ?? []) || categories.length > 50 || categories.some((category) => category.length > 100)) throw couponError("Category applicability must contain up to 50 category names");
    if (!["DRAFT", "ACTIVE", "INACTIVE"].includes(status)) throw couponError("Invalid coupon status");
    return { code, description: String(body.description || "").trim().slice(0, 300), discountType, discountValue, startsAt, endsAt, minCartValue, maxDiscount, usageLimit, perCustomerLimit, productIds, categories, status };
}

async function loadPromotionDefaults() {
    try {
        const response = await axios.get(`${getProductServiceUrl()}/api/settings/public`, { timeout: 2500 });
        const defaults = response.data?.data?.promotionDefaults || {};
        const maxUsageLimit = Number(defaults.maxUsageLimit);
        const defaultPerCustomerLimit = Number(defaults.defaultPerCustomerLimit);
        return {
            maxUsageLimit: Number.isInteger(maxUsageLimit) && maxUsageLimit >= 1 && maxUsageLimit <= 10000 ? maxUsageLimit : 1000,
            defaultPerCustomerLimit: Number.isInteger(defaultPerCustomerLimit) && defaultPerCustomerLimit >= 1 ? defaultPerCustomerLimit : 1,
        };
    } catch { return { maxUsageLimit: 1000, defaultPerCustomerLimit: 1 }; }
}

function safeCoupon(coupon) {
    const result = coupon.toObject ? coupon.toObject() : { ...coupon };
    const usageRecords = result.usageRecords || [];
    delete result.usageRecords;
    return { ...result, usageCount: usageRecords.length };
}

function inventoryServiceHeaders() {
    return { "X-Inventory-Service-Secret": process.env.INVENTORY_SERVICE_SECRET || "local-inventory-service-secret-change-me" };
}

async function reserveInventory(orderId, items) {
    return axios.post(`${getProductServiceUrl()}/internal/inventory/reservations`, {
        orderId: String(orderId), items: items.map(({ productId, quantity }) => ({ productId, quantity })),
    }, { headers: inventoryServiceHeaders(), timeout: 5000 });
}

async function releaseInventory(orderId) {
    return axios.post(`${getProductServiceUrl()}/internal/inventory/reservations/${encodeURIComponent(String(orderId))}/release`, {}, {
        headers: inventoryServiceHeaders(), timeout: 5000,
    });
}

async function commitInventory(orderId) {
    return axios.post(`${getProductServiceUrl()}/internal/inventory/reservations/${encodeURIComponent(String(orderId))}/commit`, {}, {
        headers: inventoryServiceHeaders(), timeout: 5000,
    });
}

async function enqueueOrderNotification(order, event, status) {
    const notificationUrl = process.env.NOTIFICATION_SERVICE_URL || "http://localhost:4007";
    try {
        await axios.post(`${notificationUrl}/api/notifications/order`, {
            userId: order.userId, event, orderId: String(order._id), status,
        }, {
            headers: { "X-Service-Token": process.env.NOTIFICATION_SERVICE_SECRET || "", "Idempotency-Key": `${event}/${String(order._id)}/${status || "event"}` },
            timeout: 3000,
        });
    } catch (error) {
        console.warn("Order notification could not be queued", String(order._id), event, error.message);
    }
}

app.get("/health", (req, res) => {
    res.json({ service: "order-service", status: "OK" });
});

app.post("/api/promotions/apply", authenticate, async (req, res) => {
    try {
        const items = await loadOrderItems(req.body.items);
        const quote = await getCouponQuote(req.body.code, items, req.user.userId);
        const pricing = calculateOrderAmounts(quote.subtotal, quote.discountAmount, await loadStorePricingSettings());
        return sendData(res, { code: quote.code, subtotal: quote.subtotal, eligibleSubtotal: quote.eligibleSubtotal, discountAmount: quote.discountAmount, ...pricing });
    } catch (error) { return sendError(res, error); }
});

app.post("/api/orders/quote", authenticate, async (req, res) => {
    try {
        const items = await loadOrderItems(req.body.items);
        const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
        const coupon = req.body.couponCode ? await getCouponQuote(req.body.couponCode, items, req.user.userId) : null;
        const pricing = calculateOrderAmounts(subtotal, coupon?.discountAmount || 0, await loadStorePricingSettings());
        return sendData(res, { subtotal, discountAmount: coupon?.discountAmount || 0, couponCode: coupon?.code || null, ...pricing });
    } catch (error) { return sendError(res, error); }
});

app.get("/api/promotions", authenticate, requirePermission("promotions.manage"), async (req, res) => {
    try {
        const { page, limit } = parsePagination(req.query);
        const filter = {};
        if (req.query.status && ["DRAFT", "ACTIVE", "INACTIVE", "EXPIRED"].includes(String(req.query.status).toUpperCase())) {
            const status = String(req.query.status).toUpperCase();
            if (status === "EXPIRED") filter.endsAt = { $lte: new Date() };
            else filter.status = status;
        }
        if (req.query.search) filter.code = { $regex: String(req.query.search).trim().replace(/[.*+?^${}()|[\\]\\]/g, "\\$&"), $options: "i" };
        const [coupons, total] = await Promise.all([
            Coupon.find(filter).select("+usageRecords").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            Coupon.countDocuments(filter),
        ]);
        return res.json({ success: true, data: coupons.map(safeCoupon), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
    } catch (error) { return sendError(res, error); }
});

app.post("/api/promotions", authenticate, requirePermission("promotions.manage"), async (req, res) => {
    try {
        const defaults = await loadPromotionDefaults();
        const input = { ...req.body };
        if (input.usageLimit === undefined || input.usageLimit === null || input.usageLimit === "") input.usageLimit = defaults.maxUsageLimit;
        if (input.perCustomerLimit === undefined || input.perCustomerLimit === null || input.perCustomerLimit === "") input.perCustomerLimit = defaults.defaultPerCustomerLimit;
        const coupon = await Coupon.create({ ...normalizeCouponInput(input), createdBy: req.user.userId, updatedBy: req.user.userId });
        await BusinessAudit.create({ actorUserId: req.user.userId, action: "promotion.created", targetId: String(coupon._id), metadata: { code: coupon.code, status: coupon.status, discountType: coupon.discountType, discountValue: coupon.discountValue } });
        return sendData(res, safeCoupon(coupon), 201);
    } catch (error) { return sendError(res, error.code === 11000 ? couponError("That coupon code already exists", 409) : error); }
});

app.put("/api/promotions/:id", authenticate, requirePermission("promotions.manage"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid promotion id" });
        const existing = await Coupon.findById(req.params.id).select("+usageRecords");
        if (!existing) return res.status(404).json({ success: false, message: "Promotion not found" });
        const updated = await Coupon.findOneAndUpdate({ _id: existing._id, updatedAt: existing.updatedAt }, {
            $set: { ...normalizeCouponInput(req.body, existing.usageRecords.length), updatedBy: req.user.userId },
        }, { new: true, runValidators: true }).select("+usageRecords");
        if (!updated) return res.status(409).json({ success: false, message: "Promotion changed while you were editing it. Refresh and try again." });
        await BusinessAudit.create({ actorUserId: req.user.userId, action: "promotion.updated", targetId: String(updated._id), metadata: { before: { code: existing.code, status: existing.status, discountType: existing.discountType, discountValue: existing.discountValue }, after: { code: updated.code, status: updated.status, discountType: updated.discountType, discountValue: updated.discountValue } } });
        return sendData(res, safeCoupon(updated));
    } catch (error) { return sendError(res, error.code === 11000 ? couponError("That coupon code already exists", 409) : error); }
});

app.patch("/internal/orders/:id/payment", async (req, res) => {
    const secret = process.env.PAYMENT_SERVICE_SECRET || "";
    const provided = req.get("X-Payment-Service-Secret") || "";
    const expectedBuffer = Buffer.from(secret);
    const providedBuffer = Buffer.from(provided);
    if (!secret || expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) {
        return res.status(401).json({ success: false, message: "Authentication required" });
    }
    const allowedPaymentStatuses = ["PENDING", "SUCCESS", "FAILED", "REFUNDED"];
    if (!allowedPaymentStatuses.includes(req.body.paymentStatus) || !req.body.paymentId) {
        return res.status(400).json({ success: false, message: "Valid paymentId and paymentStatus are required" });
    }
    try {
        const order = await Order.findByIdAndUpdate(req.params.id, {
            paymentId: String(req.body.paymentId),
            paymentStatus: req.body.paymentStatus,
        }, { new: true, runValidators: true });
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        if (order.paymentStatus === "SUCCESS") {
            try { await commitInventory(order._id); }
            catch { return res.status(503).json({ success: false, message: "Payment recorded; inventory reservation finalization is pending. Retry this request." }); }
            try { await commitCoupon(order._id); }
            catch { return res.status(503).json({ success: false, message: "Payment recorded; coupon finalization is pending. Retry this request." }); }
        }
        return res.json({ success: true, data: { orderId: String(order._id), paymentStatus: order.paymentStatus } });
    } catch (error) {
        return sendError(res, error);
    }
});

app.get("/internal/orders/:id/refund-eligibility", async (req, res) => {
    const secret = process.env.PAYMENT_SERVICE_SECRET || "";
    const provided = req.get("X-Payment-Service-Secret") || "";
    const expectedBuffer = Buffer.from(secret);
    const providedBuffer = Buffer.from(provided);
    if (!secret || expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) return res.status(401).json({ success: false, message: "Authentication required" });
    try {
        const order = await Order.findById(req.params.id).select("paymentStatus returnRequest.status").lean();
        if (!order) return res.status(404).json({ success: false, message: "Order not found" });
        const eligible = order.paymentStatus === "SUCCESS" && ["APPROVED", "COMPLETED"].includes(order.returnRequest?.status);
        return sendData(res, { eligible, reason: eligible ? null : "A successful payment and approved return are required" });
    } catch (error) { return sendError(res, error); }
});

app.post("/api/orders", authenticate, async (req, res) => {
    const orderId = new mongoose.Types.ObjectId();
    let reservationAttempted = false;
    let couponReservationAttempted = false;
    let orderPersisted = false;
    try {
        const items = await loadOrderItems(req.body.items);
        const subtotalAmount = items.reduce(
            (total, item) => total + item.price * item.quantity,
            0,
        );
        const quote = req.body.couponCode ? await getCouponQuote(req.body.couponCode, items, req.user.userId) : null;
        const pricing = calculateOrderAmounts(subtotalAmount, quote?.discountAmount || 0, await loadStorePricingSettings());
        const totalAmount = pricing.totalAmount;
        reservationAttempted = true;
        await reserveInventory(orderId, items);
        if (quote) {
            couponReservationAttempted = true;
            await reserveCoupon(quote, orderId, req.user.userId);
        }
        const order = await Order.create({
            _id: orderId,
            userId: req.user.userId,
            items,
            shippingAddress: req.body.shippingAddress || {},
            totalAmount,
            subtotalAmount,
            discountAmount: quote?.discountAmount || 0,
            taxAmount: pricing.taxAmount,
            shippingAmount: pricing.shippingAmount,
            currency: pricing.currency,
            couponCode: quote?.code || null,
            couponId: quote?.couponId || null,
            paymentMethod: req.body.paymentMethod || "UPI",
            statusHistory: [
                {
                    status: "PENDING",
                    note: "Order placed",
                    changedBy: req.user.userId,
                },
            ],
        });
        orderPersisted = true;

        // Payment setup is best-effort; the order remains visible with PENDING status
        // so the client can safely retry payment without losing its order record.
        try {
            const paymentResponse = await axios.post(
                `${process.env.PAYMENT_SERVICE_URL || "http://localhost:4006"}/api/payments/create`,
                {
                    orderId: String(order._id),
                    userId: req.user.userId,
                    amount: totalAmount,
                    currency: order.currency,
                    paymentMethod: req.body.paymentMethod || "UPI",
                },
                {
                    headers: {
                        Authorization: req.get("Authorization"),
                        "Idempotency-Key": `order-${String(order._id)}`,
                    },
                    timeout: 5000,
                },
            );
            const payment = paymentResponse.data.payment || paymentResponse.data.data;
            if (payment) {
                order.paymentId = String(payment._id);
                order.paymentStatus = payment.status || "PENDING";
                order.paymentCheckout = paymentResponse.data.checkout || null;
                await order.save();
            }
        } catch (paymentError) {
            console.warn("Payment setup failed for order", String(order._id), paymentError.message);
        }

        void enqueueOrderNotification(order, "order.created");

        return sendData(res, order, 201);
    } catch (error) {
        if (reservationAttempted && !orderPersisted) {
            try { await releaseInventory(orderId); }
            catch (releaseError) { console.error("Could not release inventory after failed order creation", String(orderId), releaseError.message); }
        }
        if (couponReservationAttempted && !orderPersisted) {
            try { await releaseCoupon(orderId); }
            catch (releaseError) { console.error("Could not release coupon after failed order creation", String(orderId), releaseError.message); }
        }
        if (error.response?.status === 404) {
            error.statusCode = 404;
            error.message = "A requested product was not found";
        } else if (error.response?.status >= 400 && error.response?.status < 500) {
            error.statusCode = error.response.status;
            error.message = error.response.data?.message || "A requested product is unavailable";
        } else if (error.code === "ECONNABORTED" || error.code === "ECONNREFUSED") {
            error.statusCode = 503;
            error.message = "A dependent service is unavailable";
        }
        return sendError(res, error);
    }
});

app.get("/api/orders", authenticate, async (req, res) => {
    try {
        const { page, limit } = parsePagination(req.query);
        const filter = req.user.permissions?.includes("orders.read_all") ? {} : { userId: req.user.userId };

        if (req.user.permissions?.includes("orders.read_all") && req.query.status) {
            if (!ORDER_STATUSES.includes(String(req.query.status).toUpperCase())) {
                return res.status(400).json({ success: false, message: "Invalid order status" });
            }
            filter.orderStatus = String(req.query.status).toUpperCase();
        }
        if (req.user.permissions?.includes("orders.read_all")) {
            if (req.query.paymentStatus) {
                const paymentStatus = String(req.query.paymentStatus).toUpperCase();
                if (!["PENDING", "SUCCESS", "FAILED", "REFUNDED"].includes(paymentStatus)) return res.status(400).json({ success: false, message: "Invalid payment status" });
                filter.paymentStatus = paymentStatus;
            }
            const dateRange = {};
            for (const [field, operator] of [["from", "$gte"], ["to", "$lte"]]) {
                if (req.query[field]) {
                    const date = new Date(String(req.query[field]));
                    if (Number.isNaN(date.valueOf())) return res.status(400).json({ success: false, message: `Invalid ${field} date` });
                    dateRange[operator] = date;
                }
            }
            if (dateRange.$gte && dateRange.$lte && dateRange.$gte > dateRange.$lte) return res.status(400).json({ success: false, message: "from date must be before to date" });
            if (Object.keys(dateRange).length) filter.createdAt = dateRange;
            if (req.query.search) {
                const search = String(req.query.search).trim();
                if (mongoose.isValidObjectId(search)) filter._id = search;
                else if (search) filter.userId = search;
            }
        }

        if (req.query.after) {
            const cursor = decodeOrderCursor(String(req.query.after));
            filter.$or = [
                { createdAt: { $lt: cursor.createdAt } },
                { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
            ];
            const rows = await Order.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit + 1);
            const hasNext = rows.length > limit;
            const orders = hasNext ? rows.slice(0, limit) : rows;
            const nextCursor = hasNext && orders.length ? encodeOrderCursor(orders[orders.length - 1]) : null;
            const url = new URL(`${req.protocol}://${req.get("host")}${req.originalUrl}`);
            if (nextCursor) url.searchParams.set("after", nextCursor);
            else url.searchParams.delete("after");
            const next = nextCursor ? `${url.pathname}${url.search}` : null;
            if (next) res.set("Link", `<${next}>; rel="next"`);
            return res.json({ success: true, data: orders, pagination: { limit, hasNext, nextCursor }, links: { next } });
        }

        const [orders, total] = await Promise.all([
            Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit),
            Order.countDocuments(filter),
        ]);
        const nextCursor = orders.length === limit ? encodeOrderCursor(orders[orders.length - 1]) : null;
        const url = new URL(`${req.protocol}://${req.get("host")}${req.originalUrl}`);
        if (nextCursor) url.searchParams.set("after", nextCursor);
        else url.searchParams.delete("after");
        const next = nextCursor && (page * limit < total) ? `${url.pathname}${url.search}` : null;
        if (next) res.set("Link", `<${next}>; rel="next"`);
        return res.json({
            success: true,
            data: orders,
            pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total, nextCursor: next ? nextCursor : null },
            links: { next },
        });
    } catch (error) {
        return sendError(res, error);
    }
});

app.get("/api/orders/admin/summary", authenticate, requirePermission("analytics.read"), async (req, res) => {
    try {
        const requestedDays = Number.parseInt(req.query.days, 10) || 30;
        if (![7, 30, 90].includes(requestedDays)) return res.status(400).json({ success: false, message: "days must be 7, 30, or 90" });
        const [orders, payments, trend] = await Promise.all([
            Order.aggregate([{ $group: { _id: null, totalOrders: { $sum: 1 }, pendingShipments: { $sum: { $cond: [{ $in: ["$orderStatus", ["CONFIRMED", "SHIPPED"]] }, 1, 0] } }, pendingReturns: { $sum: { $cond: [{ $eq: ["$returnRequest.status", "REQUESTED"] }, 1, 0] } } } }]),
            Order.aggregate([{ $group: {
                _id: null,
                paidOrders: { $sum: { $cond: [{ $eq: ["$paymentStatus", "SUCCESS"] }, 1, 0] } },
                pendingPayments: { $sum: { $cond: [{ $eq: ["$paymentStatus", "PENDING"] }, 1, 0] } },
                failedPayments: { $sum: { $cond: [{ $eq: ["$paymentStatus", "FAILED"] }, 1, 0] } },
                refundedPayments: { $sum: { $cond: [{ $eq: ["$paymentStatus", "REFUNDED"] }, 1, 0] } },
                grossSales: { $sum: { $cond: [{ $in: ["$paymentStatus", ["SUCCESS", "REFUNDED"]] }, { $ifNull: ["$subtotalAmount", "$totalAmount"] }, 0] } },
                discounts: { $sum: { $cond: [{ $in: ["$paymentStatus", ["SUCCESS", "REFUNDED"]] }, "$discountAmount", 0] } },
                taxes: { $sum: { $cond: [{ $in: ["$paymentStatus", ["SUCCESS", "REFUNDED"]] }, { $ifNull: ["$taxAmount", 0] }, 0] } },
                shipping: { $sum: { $cond: [{ $in: ["$paymentStatus", ["SUCCESS", "REFUNDED"]] }, { $ifNull: ["$shippingAmount", 0] }, 0] } },
                refunds: { $sum: { $cond: [{ $eq: ["$paymentStatus", "REFUNDED"] }, "$totalAmount", 0] } },
                netSales: { $sum: { $cond: [{ $eq: ["$paymentStatus", "SUCCESS"] }, { $subtract: [{ $ifNull: ["$subtotalAmount", "$totalAmount"] }, { $ifNull: ["$discountAmount", 0] }] }, 0] } },
            } }]),
            Order.aggregate([
                { $match: { createdAt: { $gte: new Date(Date.now() - requestedDays * 24 * 60 * 60_000) }, paymentStatus: { $in: ["SUCCESS", "REFUNDED"] } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, orders: { $sum: 1 }, sales: { $sum: "$totalAmount" } } },
                { $sort: { _id: 1 } },
            ]),
        ]);
        const orderStats = orders[0] || { totalOrders: 0, pendingShipments: 0, pendingReturns: 0 };
        const paymentStats = payments[0] || { paidOrders: 0, pendingPayments: 0, failedPayments: 0, refundedPayments: 0, grossSales: 0, discounts: 0, taxes: 0, shipping: 0, refunds: 0, netSales: 0 };
        return sendData(res, { ...orderStats, ...paymentStats, trend, trendDays: requestedDays });
    } catch (error) { return sendError(res, error); }
});

app.get("/api/orders/admin/top-products", authenticate, requirePermission("analytics.read"), async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 10, 1), 20);
        const match = { paymentStatus: "SUCCESS" };
        const dateFilter = {};
        for (const [key, operator] of [["from", "$gte"], ["to", "$lte"]]) {
            if (!req.query[key]) continue;
            const date = new Date(String(req.query[key]));
            if (!Number.isFinite(date.valueOf())) return res.status(400).json({ success: false, message: `Invalid ${key} date` });
            dateFilter[operator] = date;
        }
        if (dateFilter.$gte && dateFilter.$lte && dateFilter.$gte > dateFilter.$lte) return res.status(400).json({ success: false, message: "from date must be before to date" });
        if (Object.keys(dateFilter).length) match.createdAt = dateFilter;
        const items = await Order.aggregate([
            { $match: match }, { $unwind: "$items" },
            { $group: { _id: "$items.productId", name: { $first: "$items.name" }, category: { $first: "$items.category" }, unitsSold: { $sum: "$items.quantity" }, grossSales: { $sum: { $multiply: ["$items.price", "$items.quantity"] } } } },
            { $sort: { unitsSold: -1, grossSales: -1, _id: 1 } }, { $limit: limit },
        ]);
        return sendData(res, items.map((item) => ({ productId: item._id, name: item.name, category: item.category, unitsSold: item.unitsSold, grossSales: item.grossSales })));
    } catch (error) { return sendError(res, error); }
});

app.get("/api/orders/admin/report", authenticate, requirePermission("analytics.read"), async (req, res) => {
    try {
        const dateFilter = {};
        for (const [key, operator] of [["from", "$gte"], ["to", "$lte"]]) {
            if (req.query[key]) {
                const date = new Date(String(req.query[key]));
                if (Number.isNaN(date.valueOf())) return res.status(400).json({ success: false, message: `Invalid ${key} date` });
                dateFilter[operator] = date;
            }
        }
        if (dateFilter.$gte && dateFilter.$lte && dateFilter.$gte > dateFilter.$lte) return res.status(400).json({ success: false, message: "from date must be before to date" });
        const filter = Object.keys(dateFilter).length ? { createdAt: dateFilter } : {};
        const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
        const isCsv = String(req.query.format || "").toLowerCase() === "csv";
        const requestedLimit = Number.parseInt(req.query.limit, 10) || 50;
        const limit = Math.min(Math.max(requestedLimit, 1), isCsv ? 1000 : 100);
        const [orders, total, financials] = await Promise.all([
            Order.find(filter).sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
            Order.countDocuments(filter),
            Order.aggregate([{ $match: filter }, { $group: {
                _id: null,
                grossSales: { $sum: { $cond: [{ $in: ["$paymentStatus", ["SUCCESS", "REFUNDED"]] }, { $ifNull: ["$subtotalAmount", "$totalAmount"] }, 0] } },
                discounts: { $sum: { $cond: [{ $in: ["$paymentStatus", ["SUCCESS", "REFUNDED"]] }, "$discountAmount", 0] } },
                taxes: { $sum: { $cond: [{ $in: ["$paymentStatus", ["SUCCESS", "REFUNDED"]] }, { $ifNull: ["$taxAmount", 0] }, 0] } },
                shipping: { $sum: { $cond: [{ $in: ["$paymentStatus", ["SUCCESS", "REFUNDED"]] }, { $ifNull: ["$shippingAmount", 0] }, 0] } },
                refunds: { $sum: { $cond: [{ $eq: ["$paymentStatus", "REFUNDED"] }, "$totalAmount", 0] } },
                netSales: { $sum: { $cond: [{ $eq: ["$paymentStatus", "SUCCESS"] }, { $subtract: [{ $ifNull: ["$subtotalAmount", "$totalAmount"] }, { $ifNull: ["$discountAmount", 0] }] }, 0] } },
            } }]),
        ]);
        if (isCsv) {
            const cell = (value) => {
                let text = String(value ?? "");
                if (/^\s*[=+@\-]/.test(text)) text = `'${text}`;
                return `"${text.replace(/"/g, '""')}"`;
            };
            const columns = ["order_id", "customer_id", "created_at", "order_status", "payment_status", "payment_method", "payment_id", "currency", "subtotal", "discount", "tax", "shipping", "total", "refund_amount", "coupon_code"];
            const lines = [columns.join(","), ...orders.map((order) => [order._id, order.userId, order.createdAt?.toISOString(), order.orderStatus, order.paymentStatus, order.paymentMethod, order.paymentId, order.currency || "INR", order.subtotalAmount ?? order.totalAmount, order.discountAmount || 0, order.taxAmount || 0, order.shippingAmount || 0, order.totalAmount, order.paymentStatus === "REFUNDED" ? order.totalAmount : 0, order.couponCode].map(cell).join(","))];
            await BusinessAudit.create({ actorUserId: req.user.userId, action: "report.orders.exported", metadata: { from: dateFilter.$gte || null, to: dateFilter.$lte || null, page, limit, rowCount: orders.length } });
            res.set("Content-Type", "text/csv; charset=utf-8");
            res.set("Content-Disposition", `attachment; filename="smartcart-orders-page-${page}.csv"`);
            return res.status(200).send(lines.join("\r\n"));
        }
        const totals = financials[0] || { grossSales: 0, discounts: 0, taxes: 0, shipping: 0, refunds: 0, netSales: 0 };
        return sendData(res, { orders, summary: totals, pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total } });
    } catch (error) { return sendError(res, error); }
});

app.get("/api/orders/admin/audit", authenticate, requirePermission("audit.read"), async (req, res) => {
    try {
        const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
        const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
        const [events, total] = await Promise.all([BusinessAudit.find().sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), BusinessAudit.countDocuments()]);
        return sendData(res, { items: events, pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total } });
    } catch (error) { return sendError(res, error); }
});

app.get("/api/orders/:id/tracking", authenticate, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid order id" });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        if (!canViewOrder(order, req.user)) {
            return res.status(403).json({ success: false, message: "Forbidden" });
        }

        return sendData(res, {
            orderId: String(order._id),
            status: order.orderStatus,
            shipment: order.shipment,
            history: order.statusHistory,
            updatedAt: order.updatedAt,
        });
    } catch (error) {
        return sendError(res, error);
    }
});

app.get("/api/orders/:id", authenticate, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid order id" });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        if (!canViewOrder(order, req.user)) {
            return res.status(403).json({ success: false, message: "Forbidden" });
        }

        return sendData(res, order);
    } catch (error) {
        return sendError(res, error);
    }
});

app.patch("/api/orders/:id/status", authenticate, requirePermission("orders.manage"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid order id" });
        }

        const nextStatus = String(req.body.status || "").toUpperCase();
        if (!ORDER_STATUSES.includes(nextStatus)) {
            return res.status(400).json({ success: false, message: "Invalid order status" });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        if (["CONFIRMED", "SHIPPED"].includes(nextStatus) && order.paymentMethod !== "COD" && order.paymentStatus !== "SUCCESS") return res.status(409).json({ success: false, message: "Online payment must be successful before an order can be confirmed or shipped" });
        if (nextStatus === "CANCELLED" && order.paymentStatus === "SUCCESS") return res.status(409).json({ success: false, message: "Paid orders must use the return and refund process" });
        if (order.orderStatus === nextStatus && nextStatus === "CANCELLED") {
            try { await releaseInventory(order._id); }
            catch { return res.status(503).json({ success: false, message: "Order is cancelled; inventory release is pending. Retry this request." }); }
            await releaseCoupon(order._id);
            return sendData(res, order);
        }
        if (order.orderStatus === nextStatus && nextStatus === "CONFIRMED") {
            if (order.paymentStatus === "SUCCESS") {
                try { await commitInventory(order._id); await commitCoupon(order._id); }
                catch { return res.status(503).json({ success: false, message: "Order finalization is pending. Retry this request." }); }
            }
            return sendData(res, order);
        }
        if (!ALLOWED_TRANSITIONS[order.orderStatus].includes(nextStatus)) {
            return res.status(409).json({
                success: false,
                message: `Order cannot move from ${order.orderStatus} to ${nextStatus}`,
            });
        }

        const shipment = req.body.shipment || {};
        if (nextStatus === "SHIPPED" && (!shipment.carrier || !shipment.trackingNumber)) {
            return res.status(400).json({
                success: false,
                message: "Carrier and trackingNumber are required when shipping an order",
            });
        }

        order.orderStatus = nextStatus;
        if (nextStatus === "SHIPPED") {
            order.shipment.carrier = shipment.carrier;
            order.shipment.trackingNumber = shipment.trackingNumber;
            order.shipment.trackingUrl = shipment.trackingUrl || null;
            order.shipment.shippedAt = new Date();
        }
        if (nextStatus === "DELIVERED") {
            order.shipment.deliveredAt = new Date();
        }
        order.statusHistory.push({
            status: nextStatus,
            note: req.body.note || "",
            changedBy: req.user.userId,
        });

        await order.save();
        if (nextStatus === "SHIPPED" || nextStatus === "DELIVERED") void enqueueOrderNotification(order, "shipment.updated", nextStatus);
        if (nextStatus === "CANCELLED") void enqueueOrderNotification(order, "order.cancelled", nextStatus);
        if (nextStatus === "CANCELLED") {
            try { await releaseInventory(order._id); }
            catch { return res.status(503).json({ success: false, message: "Order is cancelled; inventory release is pending. Retry this request." }); }
            await releaseCoupon(order._id);
        }
        if (nextStatus === "SHIPPED" || (nextStatus === "CONFIRMED" && order.paymentStatus === "SUCCESS")) {
            try { await commitInventory(order._id); await commitCoupon(order._id); }
            catch { return res.status(503).json({ success: false, message: "Order finalization is pending. Retry this request." }); }
        }
        return sendData(res, order);
    } catch (error) {
        return sendError(res, error);
    }
});

app.post("/api/orders/:id/cancel", authenticate, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid order id" });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        if (!canViewOrder(order, req.user)) {
            return res.status(403).json({ success: false, message: "Forbidden" });
        }
        if (order.orderStatus === "CANCELLED") {
            try { await releaseInventory(order._id); }
            catch { return res.status(503).json({ success: false, message: "Order is cancelled; inventory release is pending. Retry this request." }); }
            await releaseCoupon(order._id);
            return sendData(res, order);
        }
        if (order.paymentStatus === "SUCCESS") return res.status(409).json({ success: false, message: "Paid orders must use the return and refund process" });
        if (!ALLOWED_TRANSITIONS[order.orderStatus].includes("CANCELLED")) {
            return res.status(409).json({
                success: false,
                message: "This order can no longer be cancelled",
            });
        }

        order.orderStatus = "CANCELLED";
        order.statusHistory.push({
            status: "CANCELLED",
            note: req.body.note || "Cancelled by customer",
            changedBy: req.user.userId,
        });
        await order.save();
        void enqueueOrderNotification(order, "order.cancelled", "CANCELLED");
        try { await releaseInventory(order._id); }
        catch { return res.status(503).json({ success: false, message: "Order is cancelled; inventory release is pending. Retry this request." }); }
        await releaseCoupon(order._id);
        return sendData(res, order);
    } catch (error) {
        return sendError(res, error);
    }
});

app.post("/api/orders/:id/return", authenticate, async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid order id" });
        }

        const order = await Order.findById(req.params.id);
        if (!order) {
            return res.status(404).json({ success: false, message: "Order not found" });
        }
        if (!canViewOrder(order, req.user)) {
            return res.status(403).json({ success: false, message: "Forbidden" });
        }
        if (order.returnRequest?.status === "REQUESTED") return sendData(res, order);
        if (order.orderStatus !== "DELIVERED" || order.paymentStatus === "FAILED") return res.status(409).json({ success: false, message: "Only delivered orders with a valid payment can be returned" });
        if (Date.now() - new Date(order.shipment?.deliveredAt || order.updatedAt).getTime() > 30 * 24 * 60 * 60 * 1000) return res.status(409).json({ success: false, message: "The 30-day return window has ended" });
        const reason = String(req.body.reason || "").trim();
        if (reason.length < 3 || reason.length > 500) return res.status(400).json({ success: false, message: "A return reason between 3 and 500 characters is required" });
        const updated = await Order.findOneAndUpdate(
            { _id: order._id, orderStatus: "DELIVERED", $or: [{ "returnRequest.status": "NONE" }, { "returnRequest.status": { $exists: false } }] },
            {
                $set: { "returnRequest.status": "REQUESTED", "returnRequest.reason": reason, "returnRequest.requestedBy": req.user.userId, "returnRequest.requestedAt": new Date() },
                $push: { returnHistory: { status: "REQUESTED", note: reason, changedBy: req.user.userId } },
            },
            { new: true, runValidators: true },
        );
        if (!updated) return res.status(409).json({ success: false, message: "A return request already exists for this order" });
        void enqueueOrderNotification(updated, "return.updated", "REQUESTED");
        return sendData(res, updated, 201);
    } catch (error) {
        return sendError(res, error);
    }
});

app.patch("/api/orders/:id/return-review", authenticate, requirePermission("returns.review"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid order id" });
        const status = String(req.body.status || "").toUpperCase();
        const note = String(req.body.note || "").trim();
        if (!["APPROVED", "REJECTED"].includes(status) || note.length > 500 || (status === "REJECTED" && note.length < 3)) return res.status(400).json({ success: false, message: "Set status to APPROVED or REJECTED; rejection requires a reason and notes are limited to 500 characters" });
        const updated = await Order.findOneAndUpdate(
            { _id: req.params.id, "returnRequest.status": "REQUESTED" },
            {
                $set: { "returnRequest.status": status, "returnRequest.reviewedBy": req.user.userId, "returnRequest.reviewedAt": new Date(), "returnRequest.reviewNote": note },
                $push: { returnHistory: { status, note, changedBy: req.user.userId } },
            },
            { new: true, runValidators: true },
        );
        if (!updated) return res.status(409).json({ success: false, message: "No pending return request exists for this order" });
        void enqueueOrderNotification(updated, "return.updated", status);
        return sendData(res, updated);
    } catch (error) { return sendError(res, error); }
});

app.post("/api/orders/:id/return-complete", authenticate, requirePermission("returns.review"), async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid order id" });
        const note = String(req.body.note || "").trim();
        if (note.length > 500) return res.status(400).json({ success: false, message: "Note must be 500 characters or fewer" });
        const updated = await Order.findOneAndUpdate(
            { _id: req.params.id, orderStatus: "DELIVERED", "returnRequest.status": "APPROVED" },
            {
                $set: { orderStatus: "RETURNED", "returnRequest.status": "COMPLETED", "returnRequest.completedBy": req.user.userId, "returnRequest.completedAt": new Date() },
                $push: {
                    statusHistory: { status: "RETURNED", note: note || "Return received and inspected", changedBy: req.user.userId },
                    returnHistory: { status: "COMPLETED", note, changedBy: req.user.userId },
                },
            },
            { new: true, runValidators: true },
        );
        if (!updated) return res.status(409).json({ success: false, message: "Only an approved return for a delivered order can be completed" });
        void enqueueOrderNotification(updated, "return.updated", "COMPLETED");
        return sendData(res, updated);
    } catch (error) { return sendError(res, error); }
});

app.use((error, req, res, next) => {
    if (error instanceof SyntaxError && "body" in error) {
        return res.status(400).json({ success: false, message: "Invalid JSON", requestId: res.getHeader("X-Request-Id") || req.requestId });
    }
    return sendError(res, error);
});

const port = Number(process.env.PORT) || 4005;
const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017";

if (process.env.NODE_ENV === "production" && (!process.env.INVENTORY_SERVICE_SECRET || process.env.INVENTORY_SERVICE_SECRET.length < 32 || /change-me|replace-with|local-development/i.test(process.env.INVENTORY_SERVICE_SECRET))) {
    console.error("A strong INVENTORY_SERVICE_SECRET is required in production");
    process.exit(1);
}

mongoose
    .connect(mongoUri, { dbName: process.env.MONGODB_DB || "smartcart_orders" })
    .then(() => {
        app.listen(port, () => {
            console.log(`Order service listening on port ${port}`);
        });
    })
    .catch((error) => {
        console.error("MongoDB connection failed:", error.message);
        process.exit(1);
    });
