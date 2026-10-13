const paymentService = require("../services/payment.service");
const Payment = require("../models/payment.model");
const PaymentAudit = require("../models/payment-audit.model");
const axios = require("axios");

const sendError = (res, error) => {
    const statusCode = error.code === 11000 ? 409 : error.statusCode || 500;
    return res.status(statusCode).json({ success: false, message: statusCode >= 500 ? "Payment provider or service is unavailable" : error.message });
};

const createPayment = async (req, res) => {
    try {
        const orderId = String(req.body.orderId || "");
        let orderResponse;
        try {
            orderResponse = await axios.get(`${process.env.ORDER_SERVICE_URL || "http://localhost:4005"}/api/orders/${encodeURIComponent(orderId)}`, {
                headers: { Authorization: req.get("Authorization") }, timeout: Number(process.env.ORDER_SERVICE_TIMEOUT_MS) || 5000,
            });
        } catch (error) {
            const status = error.response?.status;
            if (status === 403 || status === 404) return res.status(status).json({ success: false, message: "Order not found" });
            return res.status(503).json({ success: false, message: "Could not verify order before payment" });
        }
        const order = orderResponse.data?.data;
        if (!order || order.userId !== req.user.userId) return res.status(403).json({ success: false, message: "Payment can only be created for your own order" });
        if (["CANCELLED", "RETURNED"].includes(order.orderStatus) || order.paymentStatus === "SUCCESS" || order.paymentStatus === "REFUNDED") return res.status(409).json({ success: false, message: "This order is not eligible for a new payment" });
        if (Number(req.body.amount) !== Number(order.totalAmount) || String(req.body.paymentMethod || "").toUpperCase() !== String(order.paymentMethod || "").toUpperCase()) return res.status(409).json({ success: false, message: "Payment amount and method must match the order" });
        const result = await paymentService.createPayment({ ...req.body, currency: order.currency, userId: req.user.userId }, req.get("Idempotency-Key"));
        const payload = { payment: result.payment, checkout: result.checkout };
        return res.status(result.created ? 201 : 200).json({
            success: true,
            message: result.created ? "Payment order created" : "Existing payment returned",
            ...payload,
            data: payload,
        });
    } catch (error) { return sendError(res, error); }
};

const verifyPayment = async (req, res) => {
    try {
        const payment = await paymentService.getPaymentById(req.params.paymentId);
        if (payment.userId !== req.user.userId && !req.user.permissions?.includes("refunds.approve")) return res.status(403).json({ success: false, message: "Forbidden" });
        const verified = await paymentService.verifyCheckoutPayment({ paymentId: req.params.paymentId, ...req.body });
        return res.json({ success: true, message: "Razorpay payment verified", data: { payment: verified } });
    } catch (error) { return sendError(res, error); }
};

const getPayment = async (req, res) => {
    try {
        const payment = await paymentService.getPaymentByOrderId(req.params.orderId);
        if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });
        if (payment.userId !== req.user.userId && !req.user.permissions?.includes("refunds.approve")) return res.status(403).json({ success: false, message: "Forbidden" });
        return res.json({ success: true, payment });
    } catch (error) { return sendError(res, error); }
};

const getUserPayments = async (req, res) => {
    try {
        const requestedUser = req.params.userId || req.user.userId;
        if (requestedUser !== req.user.userId && !req.user.permissions?.includes("refunds.approve")) return res.status(403).json({ success: false, message: "Forbidden" });
        const result = await paymentService.getPaymentsByUserId(requestedUser, req.query.page, req.query.limit, req.query.status);
        return res.json({ success: true, ...result });
    } catch (error) { return sendError(res, error); }
};

const refundPayment = async (req, res) => {
    try {
        const payment = await paymentService.getPaymentById(req.params.paymentId);
        if (!req.user.permissions?.includes("refunds.approve")) return res.status(403).json({ success: false, message: "Insufficient permissions" });
        if (!process.env.ORDER_SERVICE_URL || !process.env.PAYMENT_SERVICE_SECRET) return res.status(503).json({ success: false, message: "Refund eligibility service is unavailable" });
        let eligibility;
        try {
            eligibility = await axios.get(`${process.env.ORDER_SERVICE_URL}/internal/orders/${encodeURIComponent(payment.orderId)}/refund-eligibility`, {
                headers: { "X-Payment-Service-Secret": process.env.PAYMENT_SERVICE_SECRET }, timeout: Number(process.env.ORDER_SERVICE_TIMEOUT_MS) || 3000,
            });
        } catch {
            return res.status(503).json({ success: false, message: "Could not verify return approval with the Order Service" });
        }
        if (!eligibility.data?.data?.eligible) return res.status(409).json({ success: false, message: eligibility.data?.data?.reason || "An approved return is required before refund" });
        return res.json({ success: true, message: "Refund submitted to Razorpay", data: { payment: await paymentService.refundPayment(req.params.paymentId) } });
    } catch (error) { return sendError(res, error); }
};

const csvCell = (value) => {
    let text = value == null ? "" : value instanceof Date ? value.toISOString() : String(value);
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
};

const reconciliationReport = async (req, res) => {
    if (!req.user.permissions?.includes("analytics.read")) return res.status(403).json({ success: false, message: "Insufficient permissions" });
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const exporting = req.query.format === "csv";
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || (exporting ? 5000 : 50), 1), exporting ? 5000 : 500);
    const filter = {};
    if (req.query.status) {
        const status = String(req.query.status).toUpperCase();
        if (!["PENDING", "SUCCESS", "FAILED", "REFUNDED"].includes(status)) return res.status(400).json({ success: false, message: "Invalid payment status" });
        filter.status = status;
    }
    if (req.query.paymentMethod) {
        const paymentMethod = String(req.query.paymentMethod).toUpperCase();
        if (!["UPI", "CARD", "COD"].includes(paymentMethod)) return res.status(400).json({ success: false, message: "Invalid payment method" });
        filter.paymentMethod = paymentMethod;
    }
    for (const [key, operator] of [["from", "$gte"], ["to", "$lte"]]) {
        if (req.query[key] === undefined) continue;
        const date = new Date(String(req.query[key]));
        if (!Number.isFinite(date.getTime())) return res.status(400).json({ success: false, message: `Invalid ${key} date` });
        filter.createdAt ||= {};
        filter.createdAt[operator] = date;
    }
    try {
        const [payments, total, totals] = await Promise.all([
            Payment.find(filter).select("orderId userId amount currency paymentMethod transactionId gateway status refundedAmount refundId failureReason createdAt updatedAt").sort({ createdAt: -1, _id: -1 }).skip(exporting ? 0 : (page - 1) * limit).limit(limit).lean(),
            Payment.countDocuments(filter),
            Payment.aggregate([{ $match: filter }, { $group: { _id: null, paymentCount: { $sum: 1 }, grossAmount: { $sum: { $cond: [{ $in: ["$status", ["SUCCESS", "REFUNDED"]] }, "$amount", 0] } }, refundedAmount: { $sum: "$refundedAmount" }, pendingAmount: { $sum: { $cond: [{ $eq: ["$status", "PENDING"] }, "$amount", 0] } }, failedAmount: { $sum: { $cond: [{ $eq: ["$status", "FAILED"] }, "$amount", 0] } } } }]),
        ]);
        const summary = totals[0] || { paymentCount: 0, grossAmount: 0, refundedAmount: 0, pendingAmount: 0, failedAmount: 0 };
        if (exporting) {
            const columns = ["payment_id", "order_id", "customer_id", "created_at", "updated_at", "status", "method", "currency", "amount", "refunded_amount", "refund_id", "transaction_id", "provider", "provider_order_reference", "provider_payment_reference", "failure_reason"];
            const lines = [columns.join(","), ...payments.map((payment) => [payment._id, payment.orderId, payment.userId, payment.createdAt, payment.updatedAt, payment.status, payment.paymentMethod, payment.currency, payment.amount, payment.refundedAmount, payment.refundId, payment.transactionId, payment.gateway?.provider, payment.gateway?.paymentIntentId, payment.gateway?.reference, payment.failureReason].map(csvCell).join(","))];
            await PaymentAudit.create({ actorId: req.user.userId, actorRole: req.user.role, action: "payment.reconciliation.export", targetType: "payment_report", outcome: "SUCCESS", requestId: req.get("X-Request-Id") || null, metadata: { filters: { status: filter.status, paymentMethod: filter.paymentMethod, from: filter.createdAt?.$gte, to: filter.createdAt?.$lte }, exportedRows: payments.length, matchedRows: total } });
            res.set("Content-Type", "text/csv; charset=utf-8");
            res.set("Content-Disposition", "attachment; filename=smartcart-payment-reconciliation.csv");
            return res.send(lines.join("\r\n"));
        }
        return res.json({ success: true, data: { items: payments, summary, pagination: { page, limit, total, pages: Math.ceil(total / limit), hasNext: page * limit < total } } });
    } catch (error) {
        if (exporting) await PaymentAudit.create({ actorId: req.user.userId, actorRole: req.user.role, action: "payment.reconciliation.export", targetType: "payment_report", outcome: "FAILURE", requestId: req.get("X-Request-Id") || null, metadata: { reason: "report query or export failed" } }).catch(() => {});
        return sendError(res, error);
    }
};

const paymentAudit = async (req, res) => {
    if (!req.user.permissions?.includes("audit.read")) return res.status(403).json({ success: false, message: "Insufficient permissions" });
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 100);
    try {
        const events = await PaymentAudit.find().sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
        return res.json({ success: true, data: events });
    } catch (error) { return sendError(res, error); }
};

const handleWebhook = async (req, res) => {
    try {
        const payment = await paymentService.processWebhook(req.body, req.get("X-Razorpay-Signature"), req.rawBody);
        return res.json({ success: true, message: "Webhook processed", paymentId: payment._id });
    } catch (error) { return sendError(res, error); }
};

module.exports = { createPayment, verifyPayment, getPayment, getUserPayments, refundPayment, reconciliationReport, paymentAudit, handleWebhook };
