require("dotenv").config();
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { ROLES } = require("../src/permissions");
const User = mongoose.models.User || mongoose.model("User", new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, default: "customer" },
  isActive: { type: Boolean, default: true }, emailVerified: { type: Boolean, default: false }, tokenVersion: { type: Number, default: 0 },
}, { timestamps: true }));

async function main() {
  const { MONGO_URI, MONGODB_URI, MONGODB_DB, JWT_SECRET, SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD, SUPER_ADMIN_NAME } = process.env;
  const email = String(SUPER_ADMIN_EMAIL || "").trim().toLowerCase();
  const password = String(SUPER_ADMIN_PASSWORD || "");
  const name = String(SUPER_ADMIN_NAME || "").trim();
  if (!JWT_SECRET || JWT_SECRET.length < 32 || !email || !name || password.length < 16) {
    throw new Error("Set JWT_SECRET (32+ chars), SUPER_ADMIN_NAME, SUPER_ADMIN_EMAIL, and SUPER_ADMIN_PASSWORD (16+ chars).");
  }
  await mongoose.connect(MONGODB_URI || MONGO_URI || "mongodb://127.0.0.1:27017", { dbName: MONGODB_DB || "smartcart_auth" });
  if (await User.exists({ email })) throw new Error("An account with this email already exists; bootstrap will never elevate an existing account.");
  const user = await User.create({
    name, email, password: await bcrypt.hash(password, 12), role: "super_admin",
    isActive: true, emailVerified: true, tokenVersion: 0,
  });
  console.log(`Created Super Admin account ${String(user._id)}. Sign in with the configured credentials.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
