const test = require("node:test");
const assert = require("node:assert/strict");
const Payment = require("../src/models/payment.model");
const PaymentAudit = require("../src/models/payment-audit.model");
const { reconciliationReport } = require("../src/controllers/payment.controller");

function response() {
    return {
        code: 200, headers: {}, body: undefined,
        status(code) { this.code = code; return this; },
        set(key, value) { this.headers[key] = value; return this; },
        json(value) { this.body = value; return this; },
        send(value) { this.body = value; return this; },
    };
}

test("reconciliation export requires analytics permission", async () => {
    const res = response();
    await reconciliationReport({ user: { userId: "staff-1", permissions: [] }, query: {}, get: () => "req-1" }, res);
    assert.equal(res.code, 403);
});

test("reconciliation CSV bounds records, escapes formulas, and audits export", async (context) => {
    const originals = { find: Payment.find, countDocuments: Payment.countDocuments, aggregate: Payment.aggregate, auditCreate: PaymentAudit.create };
    context.after(() => { Payment.find = originals.find; Payment.countDocuments = originals.countDocuments; Payment.aggregate = originals.aggregate; PaymentAudit.create = originals.auditCreate; });
    const record = { _id: "payment-1", orderId: "order-1", userId: "customer-1", amount: 120, currency: "INR", paymentMethod: "CARD", status: "FAILED", refundedAmount: 0, createdAt: new Date("2026-01-01T00:00:00Z"), updatedAt: new Date("2026-01-01T00:00:00Z"), failureReason: "=HYPERLINK(\"https://bad.example\")", gateway: { provider: "RAZORPAY", paymentIntentId: "pay_order_1" } };
    const query = { select() { return this; }, sort() { return this; }, skip() { return this; }, limit(n) { this.limitValue = n; return this; }, lean() { return Promise.resolve([record]); } };
    Payment.find = () => query;
    Payment.countDocuments = async () => 1;
    Payment.aggregate = async () => [{ paymentCount: 1, grossAmount: 0, refundedAmount: 0, pendingAmount: 0, failedAmount: 120 }];
    let audit;
    PaymentAudit.create = async (event) => { audit = event; };
    const res = response();
    await reconciliationReport({ user: { userId: "staff-1", role: "admin", permissions: ["analytics.read"] }, query: { format: "csv", limit: "999999" }, get: () => "request-7" }, res);
    assert.equal(query.limitValue, 5000);
    assert.equal(res.headers["Content-Type"], "text/csv; charset=utf-8");
    assert.match(res.body, /'=HYPERLINK/);
    assert.equal(audit.outcome, "SUCCESS");
    assert.equal(audit.requestId, "request-7");
    assert.equal(audit.metadata.exportedRows, 1);
});

test("reconciliation report rejects invalid status filters", async () => {
    const res = response();
    await reconciliationReport({ user: { userId: "staff-1", permissions: ["analytics.read"] }, query: { status: "UNKNOWN" }, get: () => "req-1" }, res);
    assert.equal(res.code, 400);
    assert.equal(res.body.message, "Invalid payment status");
});
