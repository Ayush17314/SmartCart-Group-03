require("dotenv").config();
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const crypto = require("crypto");
const axios = require("axios");

const app = express();
app.disable("x-powered-by");
app.use(cors({ origin: (process.env.CORS_ORIGIN || "http://localhost:3000").split(",").map((x) => x.trim()), credentials: true }));
app.use(express.json({ limit: "100kb" }));

app.use((req, res, next) => {
  req.requestId = req.get("X-Request-Id") || crypto.randomUUID();
  res.set("X-Request-Id", req.requestId);
  if (req.method === "GET" || req.method === "HEAD") {
    res.set("Cache-Control", req.path === "/health" ? "no-store" : "private, no-cache");
  }
  next();
});

const Schema = mongoose.Schema;
const Model = (name, schema) => mongoose.models[name] || mongoose.model(name, new Schema(schema, { timestamps: true }));

const reply = (res, data, status = 200) => res.status(status).json({ success: true, data });
const sendError = (res, e) => {
  const status = e.status || e.statusCode || 500;
  return res.status(status).json({
    success: false,
    message: status >= 500 && !e.status ? "Internal server error" : e.message,
    requestId: res.getHeader("X-Request-Id"),
  });
};

const auth = async (req, res, next) => {
  const authorization = req.get("Authorization") || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) {
    return res.status(401).json({ success: false, message: "Authentication required", requestId: req.requestId });
  }
  try {
    const r = await fetch(`${process.env.AUTH_SERVICE_URL || "http://localhost:4001"}/api/auth/session`, {
      headers: { Authorization: authorization, "X-Request-Id": req.requestId },
      signal: AbortSignal.timeout(3000),
    });
    if (!r.ok) {
      return res.status(r.status === 401 ? 401 : 503).json({
        success: false,
        message: r.status === 401 ? "Authentication required" : "Authentication service unavailable",
        requestId: req.requestId,
      });
    }
    req.user = (await r.json()).data.user;
    req.user.userId = req.user.id;
    return next();
  } catch {
    return res.status(503).json({ success: false, message: "Authentication service unavailable", requestId: req.requestId });
  }
};

app.get("/health", (req, res) => res.json({ success: true, data: { service: "wishlist-service", status: "OK" }, requestId: req.requestId }));

const Wishlist = Model("Wishlist", {
  userId: { type: String, unique: true, required: true },
  products: [String],
});

app.use("/api/wishlist", auth);

app.get("/api/wishlist", async (req, res) => {
  try {
    const wishlist = await Wishlist.findOne({ userId: req.user.userId }) || { products: [] };
    reply(res, wishlist);
  } catch (e) {
    sendError(res, e);
  }
});

app.post("/api/wishlist/:productId", async (req, res) => {
  try {
    await axios.get(
      `${process.env.PRODUCT_SERVICE_URL || "http://localhost:4002"}/api/products/${encodeURIComponent(req.params.productId)}`,
      {
        timeout: Number(process.env.OUTBOUND_TIMEOUT_MS) || 5000,
        headers: { "X-Request-Id": req.requestId },
      }
    );
    const updated = await Wishlist.findOneAndUpdate(
      { userId: req.user.userId },
      { $addToSet: { products: req.params.productId } },
      { new: true, upsert: true }
    );
    reply(res, updated, 201);
  } catch (e) {
    sendError(res, e);
  }
});

app.delete("/api/wishlist/:productId", async (req, res) => {
  try {
    const updated = await Wishlist.findOneAndUpdate(
      { userId: req.user.userId },
      { $pull: { products: req.params.productId } },
      { new: true }
    );
    reply(res, updated);
  } catch (e) {
    sendError(res, e);
  }
});

app.use((e, req, res, next) => {
  if (e instanceof SyntaxError) return res.status(400).json({ success: false, message: "Invalid JSON", requestId: req.requestId });
  sendError(res, e);
});

const port = Number(process.env.PORT) || 4004;
mongoose
  .connect(process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017", {
    dbName: process.env.MONGODB_DB || "smartcart_wishlist",
  })
  .then(() => app.listen(port, () => console.log("wishlist-service listening on " + port)))
  .catch((e) => {
    console.error("MongoDB connection failed", e.message);
    process.exit(1);
  });
