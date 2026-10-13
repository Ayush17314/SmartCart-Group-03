const assert = require("node:assert/strict");
const { calculateCouponQuote } = require("../src/promotion-rules");

const now = new Date("2026-06-01T12:00:00.000Z");
const items = [
    { productId: "p1", category: "Shoes", price: 100, quantity: 2 },
    { productId: "p2", category: "Home", price: 50, quantity: 1 },
];
const baseCoupon = {
    _id: "coupon-1", code: "SAVE10", status: "ACTIVE", startsAt: new Date("2026-05-01"), endsAt: new Date("2026-07-01"),
    minCartValue: 0, maxDiscount: null, usageLimit: 10, perCustomerLimit: 2, productIds: [], categories: [], usageRecords: [],
};
const quote = (coupon = {}) => calculateCouponQuote({ ...baseCoupon, ...coupon }, items, 250, "customer-1", now);

assert.equal(quote({ discountType: "PERCENTAGE", discountValue: 10 }).discountAmount, 25);
assert.equal(quote({ discountType: "FIXED", discountValue: 300 }).discountAmount, 250);
assert.equal(quote({ discountType: "PERCENTAGE", discountValue: 50, maxDiscount: 20 }).totalAmount, 230);
assert.equal(quote({ discountType: "PERCENTAGE", discountValue: 10, categories: ["shoes"] }).eligibleSubtotal, 200);
assert.throws(() => quote({ discountType: "FIXED", discountValue: 10, minCartValue: 300 }), /at least 300/);
assert.throws(() => quote({ discountType: "FIXED", discountValue: 10, productIds: ["unknown"] }), /does not apply/);
assert.throws(() => quote({ discountType: "FIXED", discountValue: 10, status: "INACTIVE" }), /invalid or inactive/);
assert.throws(() => quote({ discountType: "FIXED", discountValue: 10, endsAt: new Date("2026-06-01T12:00:00.000Z") }), /invalid or inactive/);
assert.throws(() => quote({ discountType: "FIXED", discountValue: 10, usageRecords: Array.from({ length: 10 }, (_, index) => ({ userId: `user-${index}` })) }), /usage limit/);
assert.throws(() => quote({ discountType: "FIXED", discountValue: 10, usageRecords: [{ userId: "customer-1" }, { userId: "customer-1" }] }), /per-customer limit/);

console.log("Promotion calculation tests passed (10 cases)");
