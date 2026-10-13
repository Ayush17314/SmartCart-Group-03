const assert = require("node:assert/strict");
const { payloadFor, notificationPreferenceKey, safeEqual } = require("../src/server");

const cases = [
  ["controlled order and payment templates", () => {
    assert.deepEqual(payloadFor("order.created", "order-123"), {
      subject: "Your SmartCart order was received",
      message: "We received order order-123. You can view its status in your SmartCart account.",
      metadata: { orderId: "order-123" },
    });
    assert.match(payloadFor("payment.failed", "order-456").message, /retry/);
  }],
  ["reject unknown events and missing order identity", () => {
    assert.throws(() => payloadFor("arbitrary.event", "order-1"), (error) => error.status === 400);
    assert.throws(() => payloadFor("order.created", ""), (error) => error.status === 400);
    assert.equal(payloadFor("security.account_suspended").subject, "SmartCart account security notice");
  }],
  ["require strong equal-length internal service tokens", () => {
    const secret = "a-long-random-shared-secret-value-123456";
    assert.equal(safeEqual(secret, secret), true);
    assert.equal(safeEqual(`${secret}x`, secret), false);
    assert.equal(safeEqual("tiny", "tiny"), false);
    assert.equal(safeEqual(secret, ""), false);
  }],
  ["map store notification preferences to opted-out update classes only", () => {
    assert.equal(notificationPreferenceKey("order.created"), "orderConfirmation");
    assert.equal(notificationPreferenceKey("shipment.updated"), "shipmentUpdates");
    assert.equal(notificationPreferenceKey("return.updated"), "returnUpdates");
    assert.equal(notificationPreferenceKey("refund.updated"), "returnUpdates");
    assert.equal(notificationPreferenceKey("payment.failed"), null);
    assert.equal(notificationPreferenceKey("security.account_suspended"), null);
  }],
];

for (const [name, run] of cases) {
  run();
  process.stdout.write(`✓ ${name}\n`);
}
process.stdout.write(`Passed ${cases.length} notification tests.\n`);
