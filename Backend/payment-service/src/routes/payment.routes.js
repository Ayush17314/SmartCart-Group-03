const express = require("express");
const {
    createPayment,
    verifyPayment,
    getPayment,
    getUserPayments,
    refundPayment,
    reconciliationReport,
    paymentAudit,
    handleWebhook,
} = require("../controllers/payment.controller");

const router = express.Router();

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

router.post("/webhook", handleWebhook);
router.use(authenticate);
router.post("/create", createPayment);
router.post("/verify/:paymentId", verifyPayment);
router.get("/order/:orderId", getPayment);
router.get("/user", getUserPayments);
router.get("/user/:userId", getUserPayments);
router.get("/admin/reconciliation", reconciliationReport);
router.get("/admin/audit", paymentAudit);
router.post("/refund/:paymentId", (req, res, next) => req.user.permissions?.includes("refunds.approve") ? next() : res.status(403).json({ success: false, message: "Insufficient permissions" }), refundPayment);

module.exports = router;
