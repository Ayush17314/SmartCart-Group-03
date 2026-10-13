require("dotenv").config();
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const rawDns = require("dns");
try {
  const nonLocalDns = rawDns.getServers().filter((s) => s !== "127.0.0.1" && s !== "::1");
  rawDns.setServers(["8.8.8.8", "1.1.1.1", ...nonLocalDns]);
} catch {}

const crypto = require("crypto");
const dns = rawDns.promises;
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { ROLES, PERMISSIONS, permissionsFor, hasPermission, portalAllowsRole } = require("./permissions");

const app = express();
const Schema = mongoose.Schema;
// Express 4 does not forward rejected async route handlers to error middleware.
// Wrap handlers at registration so storage/provider failures return a safe 500.
for (const method of ["get", "post", "put", "patch", "delete"]) {
  const register = app[method].bind(app);
  app[method] = (path, ...handlers) => register(path, ...handlers.map((handler) => {
    if (typeof handler !== "function" || handler.constructor.name !== "AsyncFunction") return handler;
    return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
  }));
}
const User = mongoose.models.User || mongoose.model("User", new Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true, select: false },
  phone: { type: String, trim: true, maxlength: 40 },
  role: { type: String, enum: ROLES, default: "customer" },
  isActive: { type: Boolean, default: true, index: true },
  emailVerified: { type: Boolean, default: false, index: true },
  googleId: { type: String, index: true },
  tokenVersion: { type: Number, default: 0 },
  address: Schema.Types.Mixed,
  addresses: { type: [Schema.Types.Mixed], default: [] },
  emailVerificationTokenHash: { type: String, select: false },
  emailVerificationExpiresAt: { type: Date, select: false },
  staffInviteTokenHash: { type: String, select: false },
  staffInviteExpiresAt: { type: Date, select: false },
  passwordResetTokenHash: { type: String, select: false },
  passwordResetExpiresAt: { type: Date, select: false },
}, { timestamps: true }));

const AuditEvent = mongoose.models.AuthAuditEvent || mongoose.model("AuthAuditEvent", new Schema({
  actorUserId: { type: String, default: null },
  action: { type: String, required: true, maxlength: 100 },
  targetUserId: { type: String, default: null },
  outcome: { type: String, enum: ["success", "failure"], required: true },
  requestId: { type: String, default: null },
  metadata: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true, versionKey: false }));

const LoginChallenge = mongoose.models.AuthLoginChallenge || mongoose.model("AuthLoginChallenge", new Schema({
  userId: { type: String, required: true, index: true },
  challengeIdHash: { type: String, required: true, unique: true, select: false },
  codeHash: { type: String, required: true, select: false },
  tokenVersion: { type: Number, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  consumedAt: { type: Date, default: null },
}, { timestamps: true, versionKey: false }));
LoginChallenge.schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

app.disable("x-powered-by");
app.use(cors({ origin: (process.env.CORS_ORIGIN || "http://localhost:3000").split(",").map((value) => value.trim()), credentials: true }));
app.use(express.json({ limit: "100kb" }));
app.use((req, res, next) => {
  req.requestId = req.get("X-Request-Id") || crypto.randomUUID();
  res.set("X-Request-Id", req.requestId);
  if (req.method === "GET") res.set("Cache-Control", req.path === "/health" ? "no-store" : "private, no-cache");
  next();
});

const reply = (res, data, status = 200) => res.status(status).json({ success: true, data });
const sendError = (res, error) => {
  const status = error.statusCode || (error.name === "ValidationError" || error.name === "CastError" ? 400 : 500);
  return res.status(status).json({ success: false, message: status >= 500 ? "Internal server error" : error.message, requestId: res.getHeader("X-Request-Id") });
};
function normalizeAddressItem(item = {}) {
  return {
    id: String(item.id || crypto.randomUUID()),
    label: String(item.label || "Home").trim().slice(0, 40) || "Home",
    name: String(item.name || "").trim().slice(0, 120),
    phone: String(item.phone || "").trim().slice(0, 40),
    line1: String(item.line1 || "").trim().slice(0, 240),
    city: String(item.city || "").trim().slice(0, 100),
    region: String(item.region || "").trim().slice(0, 100),
    postalCode: String(item.postalCode || "").trim().slice(0, 30),
    country: String(item.country || "India").trim().slice(0, 80) || "India",
    isDefault: Boolean(item.isDefault),
  };
}
function normalizeUserAddresses(user) {
  if (Array.isArray(user.addresses) && user.addresses.length > 0) {
    const list = user.addresses
      .filter((a) => a && typeof a === "object" && String(a.line1 || "").trim())
      .map((a) => normalizeAddressItem(a));
    if (list.length > 0) {
      const defaultIdx = list.findIndex((a) => a.isDefault);
      const chosenIdx = defaultIdx >= 0 ? defaultIdx : 0;
      list.forEach((a, idx) => { a.isDefault = idx === chosenIdx; });
    }
    return list;
  }
  if (user.address && typeof user.address === "object" && String(user.address.line1 || "").trim()) {
    return [normalizeAddressItem({ ...user.address, isDefault: true })];
  }
  return [];
}
const safeUser = (user) => {
  const addresses = normalizeUserAddresses(user);
  const defaultAddress = addresses.find((a) => a.isDefault) || addresses[0] || user.address;
  return {
    id: String(user._id), name: user.name, email: user.email, phone: user.phone,
    role: user.role, permissions: permissionsFor(user.role), isActive: user.isActive, emailVerified: user.emailVerified,
    address: defaultAddress, addresses, createdAt: user.createdAt,
  };
};
const tokenFor = (user) => jwt.sign({ userId: String(user._id), tokenVersion: user.tokenVersion || 0 }, process.env.JWT_SECRET, { expiresIn: "7d" });
const hashToken = (token) => crypto.createHash("sha256").update(token).digest("hex");
const matchesHash = (provided, expected) => {
  const providedHash = Buffer.from(hashToken(provided), "hex");
  const expectedHash = Buffer.from(expected || "", "hex");
  return providedHash.length === expectedHash.length && crypto.timingSafeEqual(providedHash, expectedHash);
};
const randomToken = () => crypto.randomBytes(32).toString("base64url");
const normalizedEmail = (email) => String(email || "").trim().toLowerCase();

async function audit(req, action, outcome, targetUserId = null, actorUserId = null, metadata = {}) {
  await AuditEvent.create({ actorUserId, action, targetUserId, outcome, requestId: req.requestId, metadata });
}

// A process-local limit complements the gateway-wide rate limit and is deliberately
// stricter for credential and token endpoints. Use a shared store before scaling replicas.
const attempts = new Map();
const dummyPasswordHash = bcrypt.hashSync("smartcart-invalid-login-dummy", 12);
function authRateLimit({ windowMs = 15 * 60_000, max = 12 } = {}) {
  return (req, res, next) => {
    const key = `${req.ip}:${req.path}`;
    const now = Date.now();
    const current = attempts.get(key);
    const entry = !current || current.resetAt <= now ? { count: 0, resetAt: now + windowMs } : current;
    entry.count += 1;
    attempts.set(key, entry);
    if (attempts.size > 5000) for (const [attemptKey, attempt] of attempts) if (attempt.resetAt <= now) attempts.delete(attemptKey);
    if (entry.count > max) return res.status(429).json({ success: false, message: "Too many requests. Please try again later.", requestId: req.requestId });
    return next();
  };
}

async function currentUserFromToken(req) {
  const authorization = req.get("Authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match || !process.env.JWT_SECRET) return null;
  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET);
    const user = await User.findById(payload.userId);
    if (!user || !user.isActive || !user.emailVerified || Number(payload.tokenVersion || 0) !== Number(user.tokenVersion || 0)) return null;
    return { user, principal: safeUser(user) };
  } catch {
    return null;
  }
}

async function authenticate(req, res, next) {
  const result = await currentUserFromToken(req);
  if (!result) {
    await audit(req, "session.validate", "failure");
    return res.status(401).json({ success: false, message: "Authentication required", requestId: req.requestId });
  }
  req.user = { ...result.principal, userId: result.principal.id };
  return next();
}

function requirePermission(permission) {
  return (req, res, next) => hasPermission(req.user, permission)
    ? next()
    : res.status(403).json({ success: false, message: "Insufficient permissions", requestId: req.requestId });
}

async function deliverEmail({ to, subject, text, html }) {
  const provider = process.env.EMAIL_PROVIDER || "mock";
  if (provider === "resend") {
    if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw Object.assign(new Error("Email provider is not configured"), { statusCode: 503 });
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST", headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [to], subject, text, html }),
      signal: AbortSignal.timeout(Number(process.env.EMAIL_TIMEOUT_MS) || 5000),
    });
    if (!response.ok) throw Object.assign(new Error("Email delivery failed"), { statusCode: 503 });
    return { delivered: true };
  }
  if (provider !== "mock" || process.env.NODE_ENV === "production") throw Object.assign(new Error("A real email provider must be configured"), { statusCode: 503 });
  // Development-only preview; never expose token links from production.
  return { delivered: false, preview: text };
}

const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/$/, "");
const genericAuthMessage = "If the account is eligible, you will receive an email with the next steps.";
function authExchangeAuthorized(req) {
  const expected = process.env.AUTH_EXCHANGE_SECRET || (process.env.NODE_ENV === "production" ? "" : "local-auth-exchange-secret-change-me");
  const received = req.get("X-Auth-Exchange-Secret") || "";
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  return expectedBuffer.length >= 32 && expectedBuffer.length === receivedBuffer.length && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

app.get("/internal/users/:id/notification-profile", async (req, res) => {
  const expected = process.env.NOTIFICATION_SERVICE_SECRET || "";
  const provided = req.get("X-Service-Token") || "";
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length < 32 || expectedBuffer.length !== providedBuffer.length || !crypto.timingSafeEqual(expectedBuffer, providedBuffer)) return res.status(401).json({ success: false, message: "Authentication required" });
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ success: false, message: "User not found" });
  try {
    const filter = { _id: req.params.id, emailVerified: true };
    if (req.query.event !== "security.account_suspended") filter.isActive = true;
    const user = await User.findOne(filter).select("name email").lean();
    if (!user) return res.status(404).json({ success: false, message: "Active verified user not found" });
    return reply(res, { id: String(user._id), name: user.name, email: user.email });
  } catch (error) { return sendError(res, error); }
});

app.get("/health", (req, res) => res.set("Cache-Control", "no-store").json({ service: "auth-service", status: "OK" }));
app.get("/api/auth/session", authenticate, async (req, res) => {
  await audit(req, "session.validate", "success", req.user.id, req.user.id);
  return reply(res, { user: req.user });
});

async function verifyRealEmailDomain(email) {
  const parts = String(email || "").split("@");
  if (parts.length !== 2 || !parts[1]) return false;
  const domain = parts[1].toLowerCase();
  if (domain === "smartcart.com") return true;
  if (["example.com", "test.com", "invalid", "localhost"].includes(domain) || domain.endsWith(".invalid") || domain.endsWith(".test")) {
    return false;
  }
  try {
    const mx = await Promise.race([
      dns.resolveMx(domain),
      new Promise((_, reject) => setTimeout(() => reject(new Error("DNS_TIMEOUT")), 2500)),
    ]);
    return Array.isArray(mx) && mx.length > 0 && mx.some((record) => record && record.exchange);
  } catch (err) {
    if (err && (err.code === "ENOTFOUND" || err.code === "ENODATA" || err.code === "ESERVFAIL")) {
      return false;
    }
    return true;
  }
}

app.post("/api/auth/register", authRateLimit({ max: 8 }), async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = normalizedEmail(req.body.email);
    const password = String(req.body.password || "");
    if (name.length < 2 || name.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || password.length < 8 || password.length > 128) {
      return res.status(400).json({ success: false, message: "Enter a name, valid email, and password between 8 and 128 characters." });
    }
    const isRealDomain = await verifyRealEmailDomain(email);
    if (!isRealDomain) {
      return res.status(400).json({ success: false, message: "Please enter a real, active email address with a valid mail server." });
    }
    const rawToken = randomToken();
    const user = await User.create({
      name, email, password: await bcrypt.hash(password, 12), role: "customer", isActive: true,
      emailVerified: false, tokenVersion: 0, emailVerificationTokenHash: hashToken(rawToken),
      emailVerificationExpiresAt: new Date(Date.now() + 60 * 60_000),
    });
    const link = `${siteUrl()}/verify-email#token=${encodeURIComponent(rawToken)}`;
    const mail = await deliverEmail({ to: email, subject: "Verify your SmartCart email", text: `Verify your email: ${link}`, html: `<p>Verify your email to activate your SmartCart account: <a href="${link}">Verify email</a></p>` });
    await audit(req, "customer.register", "success", String(user._id));
    return res.status(201).json({ success: true, message: "Account created. Verify your email before signing in.", data: { user: safeUser(user), ...(mail.preview ? { developmentEmailPreview: mail.preview } : {}) } });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "An account with this email already exists." });
    return sendError(res, error);
  }
});

app.post("/api/auth/verify-email", authRateLimit({ max: 20 }), async (req, res) => {
  const rawToken = String(req.body.token || "");
  if (!rawToken) return res.status(400).json({ success: false, message: "Verification link is invalid or expired." });
  const user = await User.findOne({ emailVerificationTokenHash: hashToken(rawToken), emailVerificationExpiresAt: { $gt: new Date() } }).select("+emailVerificationTokenHash +emailVerificationExpiresAt");
  if (!user || !user.isActive) return res.status(400).json({ success: false, message: "Verification link is invalid or expired." });
  user.emailVerified = true;
  user.emailVerificationTokenHash = undefined;
  user.emailVerificationExpiresAt = undefined;
  await user.save();
  await audit(req, "email.verify", "success", String(user._id));
  return reply(res, { message: "Email verified. You can now sign in." });
});

app.post("/api/auth/resend-verification", authRateLimit({ max: 5 }), async (req, res) => {
  const email = normalizedEmail(req.body.email);
  const user = await User.findOne({ email, emailVerified: false, isActive: true });
  let developmentEmailPreview;
  if (user) {
    const rawToken = randomToken();
    user.emailVerificationTokenHash = hashToken(rawToken);
    user.emailVerificationExpiresAt = new Date(Date.now() + 60 * 60_000);
    await user.save();
    const link = `${siteUrl()}/verify-email#token=${encodeURIComponent(rawToken)}`;
    const mail = await deliverEmail({ to: user.email, subject: "Verify your SmartCart email", text: `Verify your email: ${link}`, html: `<p><a href="${link}">Verify email</a></p>` });
    developmentEmailPreview = mail.preview;
  }
  await audit(req, "email.verification.resend", "success", user ? String(user._id) : null);
  return reply(res, { message: genericAuthMessage, ...(developmentEmailPreview ? { developmentEmailPreview } : {}) });
});

async function handleLogin(req, res, audience) {
  const email = normalizedEmail(req.body.email);
  const isRealDomain = await verifyRealEmailDomain(email);
  if (!isRealDomain) {
    return res.status(400).json({ success: false, message: "Please enter a real, verified email address." });
  }
  const user = await User.findOne({ email }).select("+password");
  const passwordMatches = await bcrypt.compare(String(req.body.password || ""), user?.password || dummyPasswordHash);
  const audienceMatches = user && portalAllowsRole(audience, user.role);
  const action = `${audience}.login`;
  if (user && passwordMatches && user.isActive && !user.emailVerified) {
    await audit(req, action, "failure", String(user._id), null, { reason: "email unverified" });
    return res.status(403).json({ success: false, code: "EMAIL_UNVERIFIED", message: "Please verify your email address before signing in. Use the Verify email link below if you need a new verification link." });
  }
  if (user && passwordMatches && user.isActive && user.emailVerified && !audienceMatches) {
    await audit(req, action, "failure", String(user._id), null, { reason: "portal mismatch" });
    return res.status(403).json({ success: false, code: "PORTAL_MISMATCH", message: "This account cannot access the selected portal. Please choose the correct login option." });
  }
  if (!user || !passwordMatches || !user.isActive || !user.emailVerified) {
    await audit(req, action, "failure", user ? String(user._id) : null);
    console.warn(JSON.stringify({ level: "warn", service: "auth-service", requestId: req.requestId, action, outcome: "failure" }));
    return res.status(401).json({ success: false, message: "Invalid email or password." });
  }
  if (audience === "super_admin") {
    const challengeId = randomToken();
    const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
    await LoginChallenge.create({
      userId: String(user._id), challengeIdHash: hashToken(challengeId), codeHash: hashToken(code),
      tokenVersion: user.tokenVersion || 0, expiresAt: new Date(Date.now() + 5 * 60_000), attempts: 0,
    });
    try {
      const mail = await deliverEmail({ to: user.email, subject: "Your SmartCart sign-in code", text: `Your Super Admin sign-in code is ${code}. It expires in five minutes.`, html: `<p>Your Super Admin sign-in code is <strong>${code}</strong>.</p><p>It expires in five minutes.</p>` });
      await audit(req, "super_admin.login.challenge", "success", String(user._id), String(user._id));
      return reply(res, { mfaRequired: true, challengeId, ...(mail.preview ? { developmentCodePreview: mail.preview.match(/\b\d{6}\b/)?.[0] } : {}) });
    } catch (error) {
      await LoginChallenge.deleteOne({ challengeIdHash: hashToken(challengeId) });
      throw error;
    }
  }
  await audit(req, action, "success", String(user._id), String(user._id));
  console.info(JSON.stringify({ level: "info", service: "auth-service", requestId: req.requestId, action, outcome: "success", userId: String(user._id) }));
  return reply(res, { user: safeUser(user), ...(authExchangeAuthorized(req) ? { token: tokenFor(user) } : {}) });
}

// The legacy login path remains customer-only so it cannot bypass audience checks.
app.post("/api/auth/login", authRateLimit({ max: 8 }), async (req, res) => handleLogin(req, res, "customer"));
app.post("/api/auth/customer-login", authRateLimit({ max: 8 }), async (req, res) => handleLogin(req, res, "customer"));
app.post("/api/auth/staff-login", authRateLimit({ max: 8 }), async (req, res) => handleLogin(req, res, "staff"));
app.post("/api/auth/super-admin-login", authRateLimit({ max: 8 }), async (req, res) => handleLogin(req, res, "super_admin"));

app.post("/api/auth/google-login", authRateLimit({ max: 12 }), async (req, res) => {
  const portal = String(req.body.portal || "customer").trim();
  const credential = String(req.body.credential || "").trim();
  if (portal === "super_admin") {
    return res.status(403).json({ success: false, message: "Google Sign-In is disabled for Super Admin accounts. Please use your email, password, and 2-step verification." });
  }
  if (!["customer", "staff"].includes(portal)) {
    return res.status(400).json({ success: false, message: "Invalid login portal." });
  }
  if (!credential) {
    return res.status(400).json({ success: false, message: "Google sign-in credential is required." });
  }
  const configuredClientId = String(process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID || "").trim();
  if (!configuredClientId) {
    return res.status(503).json({ success: false, message: "Google Sign-In is not configured yet. Set GOOGLE_CLIENT_ID in Backend/.env and NEXT_PUBLIC_GOOGLE_CLIENT_ID in Frontend/smartcart-web/.env.local." });
  }
  let tokenInfo;
  try {
    const verifyRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!verifyRes.ok) {
      return res.status(401).json({ success: false, message: "Google token verification failed. Please try signing in again." });
    }
    tokenInfo = await verifyRes.json();
  } catch {
    return res.status(503).json({ success: false, message: "Could not reach Google authentication servers. Please try again." });
  }

  if (
    !tokenInfo ||
    tokenInfo.aud !== configuredClientId ||
    !["accounts.google.com", "https://accounts.google.com"].includes(tokenInfo.iss)
  ) {
    return res.status(401).json({ success: false, message: "Invalid Google authentication token." });
  }

  const emailVerifiedByGoogle = tokenInfo.email_verified === true || tokenInfo.email_verified === "true";
  const email = normalizedEmail(tokenInfo.email);
  if (!email || !emailVerifiedByGoogle) {
    return res.status(403).json({ success: false, message: "Your Google email address must be verified by Google before signing in." });
  }
  const isRealDomain = await verifyRealEmailDomain(email);
  if (!isRealDomain) {
    return res.status(403).json({ success: false, message: "This email domain is not a valid active mail domain." });
  }

  let user = await User.findOne({ email });
  if (user && user.role === "super_admin") {
    await audit(req, `${portal}.google_login`, "failure", String(user._id), null, { reason: "super_admin blocked from google login" });
    return res.status(403).json({ success: false, message: "Super Admin accounts cannot sign in with Google." });
  }

  if (portal === "staff") {
    if (!user) {
      await audit(req, "staff.google_login", "failure", null, null, { email, reason: "no staff account" });
      return res.status(403).json({ success: false, message: "No Store Manager or Staff account was found for this Google email. Ask your Super Admin to invite this email in Staff Access first." });
    }
    if (!portalAllowsRole("staff", user.role)) {
      await audit(req, "staff.google_login", "failure", String(user._id), null, { reason: "portal mismatch" });
      return res.status(403).json({ success: false, message: "This Google account is a Customer account. Please switch to the Customer tab to sign in." });
    }
    if (!user.isActive) {
      await audit(req, "staff.google_login", "failure", String(user._id), null, { reason: "inactive" });
      return res.status(403).json({ success: false, message: "This staff account has been suspended." });
    }
    if (!user.emailVerified || !user.googleId || user.staffInviteTokenHash) {
      user.emailVerified = true;
      user.googleId = String(tokenInfo.sub || "");
      user.staffInviteTokenHash = undefined;
      user.staffInviteExpiresAt = undefined;
      await user.save();
    }
  } else {
    // portal === "customer"
    if (!user) {
      const displayName = String(tokenInfo.name || email.split("@")[0] || "Customer").trim().slice(0, 200);
      user = await User.create({
        name: displayName.length >= 2 ? displayName : "Customer",
        email,
        password: await bcrypt.hash(randomToken(), 12),
        role: "customer",
        isActive: true,
        emailVerified: true,
        googleId: String(tokenInfo.sub || ""),
        tokenVersion: 0,
      });
    } else {
      if (!portalAllowsRole("customer", user.role)) {
        await audit(req, "customer.google_login", "failure", String(user._id), null, { reason: "portal mismatch" });
        return res.status(403).json({ success: false, message: "This Google email belongs to a Store Staff or Manager account. Please switch to the Store Staff tab to sign in." });
      }
      if (!user.isActive) {
        await audit(req, "customer.google_login", "failure", String(user._id), null, { reason: "inactive" });
        return res.status(403).json({ success: false, message: "This account has been suspended." });
      }
      if (!user.emailVerified || !user.googleId) {
        user.emailVerified = true;
        user.googleId = String(tokenInfo.sub || "");
        user.emailVerificationTokenHash = undefined;
        user.emailVerificationExpiresAt = undefined;
        await user.save();
      }
    }
  }

  await audit(req, `${portal}.google_login`, "success", String(user._id), String(user._id));
  return reply(res, { user: safeUser(user), ...(authExchangeAuthorized(req) ? { token: tokenFor(user) } : {}) });
});

app.post("/api/auth/super-admin-verify", authRateLimit({ max: 8 }), async (req, res) => {
  const challengeId = String(req.body.challengeId || "");
  const code = String(req.body.code || "");
  if (!/^[A-Za-z0-9_-]{40,64}$/.test(challengeId) || !/^\d{6}$/.test(code)) return res.status(401).json({ success: false, message: "Invalid or expired verification code." });
  const challenge = await LoginChallenge.findOne({ challengeIdHash: hashToken(challengeId), expiresAt: { $gt: new Date() }, consumedAt: null, attempts: { $lt: 5 } }).select("+codeHash");
  if (!challenge) return res.status(401).json({ success: false, message: "Invalid or expired verification code." });
  if (!matchesHash(code, challenge.codeHash)) {
    await LoginChallenge.updateOne({ _id: challenge._id, consumedAt: null, attempts: challenge.attempts }, { $inc: { attempts: 1 } });
    return res.status(401).json({ success: false, message: "Invalid or expired verification code." });
  }
  const consumed = await LoginChallenge.updateOne({ _id: challenge._id, consumedAt: null, attempts: challenge.attempts }, { $set: { consumedAt: new Date() } });
  if (!consumed.modifiedCount) return res.status(401).json({ success: false, message: "Invalid or expired verification code." });
  const user = await User.findById(challenge.userId);
  if (!user || user.role !== "super_admin" || !user.isActive || !user.emailVerified || Number(user.tokenVersion || 0) !== Number(challenge.tokenVersion)) {
    await audit(req, "super_admin.login", "failure", challenge.userId);
    return res.status(401).json({ success: false, message: "Invalid or expired verification code." });
  }
  await audit(req, "super_admin.login", "success", String(user._id), String(user._id));
  return reply(res, { user: safeUser(user), ...(authExchangeAuthorized(req) ? { token: tokenFor(user) } : {}) });
});

app.post("/api/auth/forgot-password", authRateLimit({ max: 5 }), async (req, res) => {
  const email = normalizedEmail(req.body.email);
  const user = await User.findOne({ email, isActive: true, emailVerified: true });
  let developmentEmailPreview;
  if (user) {
    const rawToken = randomToken();
    user.passwordResetTokenHash = hashToken(rawToken);
    user.passwordResetExpiresAt = new Date(Date.now() + 30 * 60_000);
    await user.save();
    const link = `${siteUrl()}/reset-password#token=${encodeURIComponent(rawToken)}`;
    const mail = await deliverEmail({ to: user.email, subject: "Reset your SmartCart password", text: `Reset your password: ${link}`, html: `<p>Reset your password: <a href="${link}">Reset password</a></p>` });
    developmentEmailPreview = mail.preview;
  }
  await audit(req, "password.reset.request", "success", user ? String(user._id) : null);
  return reply(res, { message: genericAuthMessage, ...(developmentEmailPreview ? { developmentEmailPreview } : {}) });
});

app.post("/api/auth/reset-password", authRateLimit({ max: 5 }), async (req, res) => {
  const rawToken = String(req.body.token || "");
  const password = String(req.body.password || "");
  if (password.length < 8 || password.length > 128) return res.status(400).json({ success: false, message: "Password must be between 8 and 128 characters." });
  const user = await User.findOne({ passwordResetTokenHash: hashToken(rawToken), passwordResetExpiresAt: { $gt: new Date() } }).select("+passwordResetTokenHash +passwordResetExpiresAt");
  if (!user || !user.isActive) return res.status(400).json({ success: false, message: "Reset link is invalid or expired." });
  user.password = await bcrypt.hash(password, 12);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpiresAt = undefined;
  user.tokenVersion += 1;
  await user.save();
  await audit(req, "password.reset.complete", "success", String(user._id), String(user._id));
  return reply(res, { message: "Password updated. Please sign in again." });
});

app.get("/api/auth/profile", authenticate, async (req, res) => reply(res, req.user));
app.post("/api/auth/logout", authenticate, async (req, res) => {
  const user = await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } }, { new: true });
  await audit(req, "logout", "success", req.user.id, req.user.id);
  return reply(res, { loggedOut: true, userId: String(user._id) });
});
app.put("/api/auth/profile", authenticate, async (req, res) => {
  const updates = {};
  if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
  if (req.body.phone !== undefined) updates.phone = String(req.body.phone).trim();
  if (Array.isArray(req.body.addresses)) {
    if (req.body.addresses.length > 20) {
      return res.status(400).json({ success: false, message: "You can save up to 20 addresses." });
    }
    const cleaned = [];
    for (const raw of req.body.addresses) {
      if (!raw || typeof raw !== "object") continue;
      const item = normalizeAddressItem(raw);
      if (!item.name || !item.line1 || !item.city || !item.region || !item.postalCode || !item.country) {
        return res.status(400).json({ success: false, message: "Each address must include recipient name, street address, city, state/region, postal code, and country." });
      }
      cleaned.push(item);
    }
    if (cleaned.length > 0) {
      const defaultIdx = cleaned.findIndex((a) => a.isDefault);
      const chosenIdx = defaultIdx >= 0 ? defaultIdx : 0;
      cleaned.forEach((a, idx) => { a.isDefault = idx === chosenIdx; });
    }
    updates.addresses = cleaned;
    updates.address = cleaned.find((a) => a.isDefault) || cleaned[0] || null;
  } else if (req.body.address !== undefined) {
    updates.address = req.body.address;
  }
  const user = await User.findByIdAndUpdate(req.user.id, updates, { new: true, runValidators: true });
  await audit(req, "profile.update", "success", String(user._id), String(user._id));
  return reply(res, safeUser(user));
});

app.get("/api/auth/users", authenticate, requirePermission("staff.read"), async (req, res) => {
  const users = await User.find({ role: { $ne: "customer" } }).sort({ createdAt: -1 }).limit(100);
  return reply(res, users.map(safeUser));
});
app.post("/api/auth/users/invite", authRateLimit({ max: 10 }), authenticate, requirePermission("staff.manage"), async (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = normalizedEmail(req.body.email);
  const role = String(req.body.role || "");
  if (name.length < 2 || name.length > 200 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ success: false, message: "Enter a name and valid email address." });
  const domainCheck = await verifyRealEmailDomain(email);
  if (!domainCheck.valid) return res.status(400).json({ success: false, message: domainCheck.reason });
  if (!["support", "inventory_staff", "admin", "super_admin"].includes(role)) return res.status(400).json({ success: false, message: "Choose a valid staff role." });
  if (role === "super_admin" && req.user.role !== "super_admin") return res.status(403).json({ success: false, message: "Only a Super Admin can invite another Super Admin." });
  const rawToken = randomToken();
  const inviteHash = hashToken(rawToken);
  let user;
  try {
    user = await User.create({ name, email, password: await bcrypt.hash(randomToken(), 12), role, isActive: true, emailVerified: false, staffInviteTokenHash: inviteHash, staffInviteExpiresAt: new Date(Date.now() + 24 * 60 * 60_000) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: "An account with this email already exists." });
    throw error;
  }
  try {
    const link = `${siteUrl()}/accept-staff-invite#token=${encodeURIComponent(rawToken)}`;
    const mail = await deliverEmail({ to: email, subject: "You are invited to SmartCart staff", text: `Accept your SmartCart staff invitation: ${link}`, html: `<p>You have been invited to SmartCart staff. <a href="${link}">Set your password and accept the invitation</a>.</p>` });
    await audit(req, "staff.invite", "success", String(user._id), req.user.id, { role });
    return res.status(201).json({ success: true, message: "Staff invitation sent.", data: { user: safeUser(user), ...(mail.preview ? { developmentEmailPreview: mail.preview } : {}) } });
  } catch (error) {
    await User.deleteOne({ _id: user._id, staffInviteTokenHash: inviteHash });
    await audit(req, "staff.invite", "failure", String(user._id), req.user.id, { role, reason: "delivery failed" });
    throw error;
  }
});
app.post("/api/auth/users/:id/resend-invite", authRateLimit({ max: 10 }), authenticate, requirePermission("staff.manage"), async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ success: false, message: "Invalid staff account id." });
  const user = await User.findOne({ _id: req.params.id, role: { $ne: "customer" }, isActive: true, emailVerified: false }).select("+staffInviteTokenHash +staffInviteExpiresAt");
  if (!user || !user.staffInviteTokenHash) return res.status(409).json({ success: false, message: "This account has no pending staff invitation." });
  const rawToken = randomToken();
  user.staffInviteTokenHash = hashToken(rawToken);
  user.staffInviteExpiresAt = new Date(Date.now() + 24 * 60 * 60_000);
  await user.save();
  try {
    const link = `${siteUrl()}/accept-staff-invite#token=${encodeURIComponent(rawToken)}`;
    const mail = await deliverEmail({ to: user.email, subject: "Your SmartCart staff invitation", text: `Accept your SmartCart staff invitation: ${link}`, html: `<p>Set a password to activate your SmartCart staff account. <a href="${link}">Accept invitation</a>.</p>` });
    await audit(req, "staff.invite.resend", "success", String(user._id), req.user.id, { role: user.role });
    return reply(res, { user: safeUser(user), ...(mail.preview ? { developmentEmailPreview: mail.preview } : {}) });
  } catch (error) {
    await audit(req, "staff.invite.resend", "failure", String(user._id), req.user.id, { role: user.role, reason: "delivery failed" });
    throw error;
  }
});
app.post("/api/auth/accept-staff-invite", authRateLimit({ max: 8 }), async (req, res) => {
  const rawToken = String(req.body.token || "");
  const password = String(req.body.password || "");
  if (password.length < 8 || password.length > 128) return res.status(400).json({ success: false, message: "Password must be between 8 and 128 characters." });
  const user = await User.findOneAndUpdate(
    { staffInviteTokenHash: hashToken(rawToken), staffInviteExpiresAt: { $gt: new Date() }, emailVerified: false, isActive: true },
    { $set: { password: await bcrypt.hash(password, 12), emailVerified: true }, $unset: { staffInviteTokenHash: 1, staffInviteExpiresAt: 1 }, $inc: { tokenVersion: 1 } },
    { new: true, runValidators: true },
  ).select("_id role");
  if (!user) return res.status(400).json({ success: false, message: "Staff invitation is invalid or expired." });
  await audit(req, "staff.invite.accept", "success", String(user._id), String(user._id), { role: user.role });
  return reply(res, { message: "Staff invitation accepted. You can now sign in." });
});
app.get("/api/auth/customers", authenticate, requirePermission("customers.read"), async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const filter = { role: "customer" };
  if (req.query.status && !["active", "suspended"].includes(String(req.query.status))) return res.status(400).json({ success: false, message: "Invalid customer status filter." });
  if (req.query.status) filter.isActive = req.query.status === "active";
  const search = String(req.query.search || "").trim();
  if (search.length > 100) return res.status(400).json({ success: false, message: "Search must be 100 characters or fewer." });
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ name: { $regex: escaped, $options: "i" } }, { email: { $regex: escaped, $options: "i" } }];
  }
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    User.countDocuments(filter),
  ]);
  return res.json({ success: true, data: users.map(safeUser), pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
});
app.get("/api/auth/customers/export", authenticate, requirePermission("customers.read"), async (req, res) => {
  const filter = { role: "customer" };
  if (req.query.status && !["active", "suspended"].includes(String(req.query.status))) return res.status(400).json({ success: false, message: "Invalid customer status filter." });
  if (req.query.status) filter.isActive = req.query.status === "active";
  const search = String(req.query.search || "").trim();
  if (search.length > 100) return res.status(400).json({ success: false, message: "Search must be 100 characters or fewer." });
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter.$or = [{ name: { $regex: escaped, $options: "i" } }, { email: { $regex: escaped, $options: "i" } }];
  }
  const createdAt = {};
  for (const [key, operator] of [["from", "$gte"], ["to", "$lte"]]) {
    if (!req.query[key]) continue;
    const date = new Date(String(req.query[key]));
    if (Number.isNaN(date.valueOf())) return res.status(400).json({ success: false, message: `Invalid ${key} date.` });
    createdAt[operator] = date;
  }
  if (createdAt.$gte && createdAt.$lte && createdAt.$gte > createdAt.$lte) return res.status(400).json({ success: false, message: "from date must be before to date." });
  if (Object.keys(createdAt).length) filter.createdAt = createdAt;
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 1000, 1), 5000);
  const users = await User.find(filter).select("name email phone isActive emailVerified createdAt").sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^\s*[=+@\-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const headers = ["name", "email", "phone", "status", "email_verified", "created_at"];
  const rows = users.map((user) => [user.name, user.email, user.phone, user.isActive ? "active" : "suspended", user.emailVerified, user.createdAt?.toISOString()].map(cell).join(","));
  await audit(req, "customer.export", "success", null, req.user.id, { limit, rowCount: users.length, search: Boolean(search), status: req.query.status || "all", from: createdAt.$gte || null, to: createdAt.$lte || null });
  res.set("Content-Type", "text/csv; charset=utf-8");
  res.set("Content-Disposition", "attachment; filename=smartcart-customers.csv");
  return res.status(200).send([headers.join(","), ...rows].join("\r\n"));
});
app.get("/api/auth/admin/summary", authenticate, requirePermission("analytics.read"), async (req, res) => {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000);
  const [customers, newCustomers] = await Promise.all([
    User.countDocuments({ role: "customer" }),
    User.countDocuments({ role: "customer", createdAt: { $gte: since } }),
  ]);
  return reply(res, { customers, newCustomers30d: newCustomers });
});
app.put("/api/auth/users/:id/role", authenticate, requirePermission("staff.manage"), async (req, res) => {
  const role = String(req.body.role || "");
  if (!ROLES.includes(role)) return res.status(400).json({ success: false, message: "Invalid role." });
  const existing = await User.findById(req.params.id);
  if (!existing) return res.status(404).json({ success: false, message: "User not found." });
  if (String(existing._id) === req.user.id) return res.status(409).json({ success: false, message: "You cannot change your own staff role." });
  if ((role === "super_admin" || existing.role === "super_admin") && req.user.role !== "super_admin") return res.status(403).json({ success: false, message: "Only a Super Admin can manage Super Admin access." });
  if (req.user.role !== "super_admin" && role === "admin" && !hasPermission(req.user, "staff.manage")) return res.status(403).json({ success: false, message: "Insufficient permissions." });
  const previousRole = existing.role;
  existing.role = role;
  existing.tokenVersion += 1;
  await existing.save();
  await audit(req, "staff.role.change", "success", String(existing._id), req.user.id, { previousRole, role });
  return reply(res, safeUser(existing));
});
app.patch("/api/auth/users/:id/status", authenticate, requirePermission("customers.manage"), async (req, res) => {
  const isActive = req.body.isActive;
  const reason = String(req.body.reason || "").trim();
  if (typeof isActive !== "boolean" || !reason) return res.status(400).json({ success: false, message: "isActive and a reason are required." });
  const user = await User.findById(req.params.id);
  if (!user) return res.status(404).json({ success: false, message: "User not found." });
  if (String(user._id) === req.user.id) return res.status(409).json({ success: false, message: "You cannot change your own account status." });
  if (user.role === "super_admin" && req.user.role !== "super_admin") return res.status(403).json({ success: false, message: "Only a Super Admin can change Super Admin status." });
  user.isActive = isActive;
  user.tokenVersion += 1;
  await user.save();
  await audit(req, isActive ? "account.activate" : "account.suspend", "success", String(user._id), req.user.id, { reason });
  if (!isActive && process.env.NOTIFICATION_SERVICE_URL && process.env.NOTIFICATION_SERVICE_SECRET) {
    axios.post(`${process.env.NOTIFICATION_SERVICE_URL}/api/notifications/email`, { userId: String(user._id), event: "security.account_suspended" }, {
      headers: { "X-Service-Token": process.env.NOTIFICATION_SERVICE_SECRET, "Idempotency-Key": `security.account_suspended/${String(user._id)}/${user.tokenVersion}` }, timeout: 3000,
    }).catch((error) => console.warn(JSON.stringify({ level: "warn", service: "auth-service", requestId: req.requestId, action: "suspension.notification", outcome: "queue_failed", error: error.message })));
  }
  return reply(res, safeUser(user));
});
app.get("/api/auth/audit", authenticate, requirePermission("audit.read"), async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 100);
  const events = await AuditEvent.find().sort({ createdAt: -1 }).limit(limit).lean();
  return reply(res, events);
});

app.use((error, req, res, next) => {
  if (error instanceof SyntaxError) return res.status(400).json({ success: false, message: "Invalid JSON", requestId: req.requestId });
  return sendError(res, error);
});

if (require.main === module) {
  const port = Number(process.env.PORT) || 4001;
  if (process.env.NODE_ENV === "production" && (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || /change-me|replace-with|local-development/i.test(process.env.JWT_SECRET))) {
    console.error(JSON.stringify({ level: "error", service: "auth-service", message: "A strong, non-placeholder JWT_SECRET is required in production" }));
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && (!process.env.AUTH_EXCHANGE_SECRET || process.env.AUTH_EXCHANGE_SECRET.length < 32 || /change-me|replace-with|local-development/i.test(process.env.AUTH_EXCHANGE_SECRET))) {
    console.error(JSON.stringify({ level: "error", service: "auth-service", message: "A strong AUTH_EXCHANGE_SECRET is required in production" }));
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && (process.env.EMAIL_PROVIDER !== "resend" || !process.env.RESEND_API_KEY || !process.env.EMAIL_FROM)) {
    console.error(JSON.stringify({ level: "error", service: "auth-service", message: "Configure the Resend email provider before production startup" }));
    process.exit(1);
  }
  if (process.env.NODE_ENV === "production" && (!process.env.NOTIFICATION_SERVICE_SECRET || process.env.NOTIFICATION_SERVICE_SECRET.length < 32 || /change-me|replace-with|local-development/i.test(process.env.NOTIFICATION_SERVICE_SECRET))) {
    console.error(JSON.stringify({ level: "error", service: "auth-service", message: "A strong NOTIFICATION_SERVICE_SECRET is required in production" }));
    process.exit(1);
  }
  mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017", { dbName: process.env.MONGODB_DB || "smartcart_auth" })
    .then(() => app.listen(port, () => console.log(JSON.stringify({ level: "info", service: "auth-service", message: "listening", port }))))
    .catch((error) => { console.error(JSON.stringify({ level: "error", service: "auth-service", message: "MongoDB connection failed", error: error.message })); process.exit(1); });
}

module.exports = { app, User, AuditEvent, LoginChallenge, permissionsFor, hasPermission, currentUserFromToken };
