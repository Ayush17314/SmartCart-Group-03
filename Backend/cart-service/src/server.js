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

const escapeXml = (val) => String(val ?? "").replace(/[<>&"']/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c]);
const xmlTag = (val) => String(val).replace(/[^a-zA-Z0-9_.-]/g, "_") || "item";
const toXml = (val, tag = "item") => {
  const safe = xmlTag(tag);
  if (val === null || val === undefined) return `<${safe}/>`;
  if (Array.isArray(val)) return val.map((x) => toXml(x, "item")).join("");
  if (typeof val === "object") return `<${safe}>${Object.entries(val).map(([k, v]) => toXml(v, k)).join("")}</${safe}>`;
  return `<${safe}>${escapeXml(val)}</${safe}>`;
};
const asXml = (res) => `<?xml version="1.0" encoding="UTF-8"?>${toXml(res, "response")}`;

const reply = (res, data, status = 200) => {
  res.vary("Accept");
  if (res.req && res.req.accepts && res.req.accepts(["json", "xml"]) === "xml") {
    return res.status(status).type("application/xml").send(asXml({ success: true, data }));
  }
  return res.status(status).json({ success: true, data });
};

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

app.get("/health", (req, res) => res.json({ success: true, data: { service: "cart-service", status: "OK" }, requestId: req.requestId }));

const Cart = Model("Cart", {
  userId: { type: String, unique: true, required: true },
  items: [{ productId: String, name: String, price: Number, quantity: Number, image: String }],
  total: Number,
});

app.use("/api/cart", auth);

app.get("/api/cart", async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.user.userId }) || { items: [], total: 0 };
    reply(res, cart);
  } catch (e) {
    sendError(res, e);
  }
});

app.post("/api/cart/items", async (req, res) => {
  try {
    const productResponse = await axios.get(
      `${process.env.PRODUCT_SERVICE_URL || "http://localhost:4002"}/api/products/${encodeURIComponent(req.body.productId)}`,
      {
        timeout: Number(process.env.OUTBOUND_TIMEOUT_MS) || 5000,
        headers: { "X-Request-Id": req.requestId },
      }
    );
    const p = productResponse.data?.data;
    if (!p) return res.status(404).json({ success: false, message: "Product not found", requestId: req.requestId });

    let c = await Cart.findOne({ userId: req.user.userId }) || new Cart({ userId: req.user.userId, items: [] });
    let i = c.items.find((x) => x.productId === String(p._id));
    const qty = Math.max(1, +req.body.quantity || 1);
    if (i) i.quantity += qty;
    else c.items.push({ productId: String(p._id), name: p.name, price: p.price, quantity: qty, image: p.images?.[0] });
    c.total = c.items.reduce((a, x) => a + x.price * x.quantity, 0);
    await c.save();
    reply(res, c, 201);
  } catch (e) {
    sendError(res, e);
  }
});

app.put("/api/cart/items/:productId", async (req, res) => {
  try {
    const c = await Cart.findOne({ userId: req.user.userId });
    const i = c?.items.find((x) => x.productId === req.params.productId);
    if (!i) return res.status(404).json({ success: false, message: "Item not found", requestId: req.requestId });
    i.quantity = Math.max(1, +req.body.quantity || 1);
    c.total = c.items.reduce((a, x) => a + x.price * x.quantity, 0);
    await c.save();
    reply(res, c);
  } catch (e) {
    sendError(res, e);
  }
});

app.delete("/api/cart/items/:productId", async (req, res) => {
  try {
    const c = await Cart.findOne({ userId: req.user.userId });
    if (c) {
      c.items = c.items.filter((x) => x.productId !== req.params.productId);
      c.total = c.items.reduce((a, x) => a + x.price * x.quantity, 0);
      await c.save();
    }
    reply(res, c);
  } catch (e) {
    sendError(res, e);
  }
});

app.delete("/api/cart", async (req, res) => {
  try {
    await Cart.findOneAndUpdate({ userId: req.user.userId }, { items: [], total: 0 }, { upsert: true });
    reply(res, null);
  } catch (e) {
    sendError(res, e);
  }
});

app.use((e, req, res, next) => {
  if (e instanceof SyntaxError) return res.status(400).json({ success: false, message: "Invalid JSON", requestId: req.requestId });
  sendError(res, e);
});

const port = Number(process.env.PORT) || 4003;
mongoose
  .connect(process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017", {
    dbName: process.env.MONGODB_DB || "smartcart_cart",
  })
  .then(() => app.listen(port, () => console.log("cart-service listening on " + port)))
  .catch((e) => {
    console.error("MongoDB connection failed", e.message);
    process.exit(1);
  });
