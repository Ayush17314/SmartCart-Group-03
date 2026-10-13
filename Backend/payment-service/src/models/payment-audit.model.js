const mongoose = require("mongoose");

const paymentAuditSchema = new mongoose.Schema({
    actorId: { type: String, required: true, index: true },
    actorRole: { type: String, default: "unknown" },
    action: { type: String, required: true, index: true },
    targetType: { type: String, required: true },
    targetId: { type: String, default: null },
    outcome: { type: String, enum: ["SUCCESS", "FAILURE"], required: true },
    requestId: { type: String, default: null },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true, versionKey: false });

paymentAuditSchema.index({ createdAt: -1 });

module.exports = mongoose.model("PaymentAudit", paymentAuditSchema);
