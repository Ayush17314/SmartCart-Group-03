const mongoose = require("mongoose");
require("dotenv").config();
require("dotenv").config({ path: require("path").resolve(__dirname, "../../../.env") });

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, { dbName: process.env.MONGODB_DB || "smartcart_payments" });
        console.log("MongoDB Connected");
    } catch (error) {
        console.error("MongoDB Connection Failed:", error.message);
        process.exit(1);
    }
};

module.exports = connectDB;
