function couponError(message, statusCode = 400) {
    return Object.assign(new Error(message), { statusCode });
}

function calculateCouponQuote(coupon, items, subtotal, userId, now = new Date()) {
    if (!coupon || coupon.status !== "ACTIVE" || new Date(coupon.startsAt) > now || new Date(coupon.endsAt) <= now) throw couponError("This coupon is invalid or inactive", 400);
    if (subtotal < coupon.minCartValue) throw couponError(`This coupon requires a cart subtotal of at least ${coupon.minCartValue}`, 400);
    const productIds = new Set(coupon.productIds || []);
    const categories = new Set((coupon.categories || []).map((category) => category.toLowerCase()));
    const scoped = productIds.size > 0 || categories.size > 0;
    const eligibleSubtotal = items.reduce((sum, item) => {
        const eligible = !scoped || productIds.has(String(item.productId)) || categories.has(String(item.category || "").toLowerCase());
        return sum + (eligible ? item.price * item.quantity : 0);
    }, 0);
    if (eligibleSubtotal <= 0) throw couponError("This coupon does not apply to the items in your cart", 400);
    const usages = coupon.usageRecords || [];
    if (usages.length >= coupon.usageLimit) throw couponError("This coupon has reached its usage limit", 409);
    const customerUsage = usages.filter((usage) => usage.userId === String(userId)).length;
    if (customerUsage >= coupon.perCustomerLimit) throw couponError("You have reached this coupon's per-customer limit", 409);
    const raw = coupon.discountType === "PERCENTAGE" ? eligibleSubtotal * coupon.discountValue / 100 : coupon.discountValue;
    const capped = coupon.maxDiscount === null || coupon.maxDiscount === undefined ? raw : Math.min(raw, coupon.maxDiscount);
    const discountAmount = Math.round(Math.min(capped, eligibleSubtotal, subtotal) * 100) / 100;
    if (discountAmount <= 0) throw couponError("This coupon does not provide a discount for this cart", 400);
    return { coupon, code: coupon.code, couponId: coupon._id, subtotal, eligibleSubtotal, discountAmount, totalAmount: Math.max(0, Math.round((subtotal - discountAmount) * 100) / 100) };
}

module.exports = { calculateCouponQuote, couponError };
