const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const paymentRoutes = require("./routes/payment.routes");

const app = express();
app.disable("x-powered-by");
app.use(cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:3000").split(",").map((value) => value.trim()),
    credentials: true,
}));
app.use((req, res, next) => {
    req.requestId = req.get("X-Request-Id") || crypto.randomUUID();
    res.set("X-Request-Id", req.requestId);
    next();
});
app.use(express.json({
    limit: "100kb",
    verify: (req, res, buffer) => { req.rawBody = buffer; },
}));
app.use((req, res, next) => {
    if (req.method === "GET") res.set("Cache-Control", req.path === "/health" ? "no-store" : "private, no-cache");
    next();
});

app.get("/health", (req, res) => res.status(200).json({ success: true, data: { service: "payment-service" } }));
app.use("/api/payments", paymentRoutes);
app.use((req, res) => res.status(404).json({ success: false, message: "Route not found", requestId: req.requestId }));
app.use((error, req, res, next) => {
    const status = error.statusCode || (error instanceof SyntaxError ? 400 : 500);
    console.error(JSON.stringify({ level: "error", service: "payment-service", requestId: req.requestId, message: error.message, status }));
    res.status(status).json({ success: false, message: status >= 500 ? "Internal server error" : error.message, requestId: req.requestId });
});

module.exports = app;
