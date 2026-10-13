require("dotenv").config();
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const mongoose = require("mongoose");

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI || "mongodb://127.0.0.1:27017";
  await mongoose.connect(uri, { dbName: process.env.MONGODB_DB || "smartcart_auth" });
  const users = mongoose.connection.collection("users");
  const result = await users.updateMany(
    { $or: [{ isActive: { $exists: false } }, { emailVerified: { $exists: false } }, { tokenVersion: { $exists: false } }] },
    [{ $set: { isActive: { $ifNull: ["$isActive", true] }, emailVerified: { $ifNull: ["$emailVerified", true] }, tokenVersion: { $ifNull: ["$tokenVersion", 0] } } }],
  );
  console.log(`Updated ${result.modifiedCount} legacy user records. Existing customer/admin roles were preserved.`);
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => { await mongoose.disconnect(); });
