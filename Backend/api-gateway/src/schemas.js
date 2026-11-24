const Ajv = require("ajv");

const ajv = new Ajv({ allErrors: true, coerceTypes: true, removeAdditional: false });
const schemas = {
    productCreate: {
        type: "object", additionalProperties: false, required: ["name", "price", "category"],
        properties: {
            name: { type: "string", minLength: 1, maxLength: 200 },
            sku: { type: "string", maxLength: 80 },
            description: { type: "string", maxLength: 5000 },
            price: { type: "number", minimum: 0 },
            category: { type: "string", minLength: 1, maxLength: 100 },
            brand: { type: "string", maxLength: 100 },
            images: { type: "array", items: { type: "string", maxLength: 2048, pattern: "^https://" } },
            stock: { type: "integer", minimum: 0 },
            stockAdjustmentReason: { type: "string", maxLength: 500 },
            rating: { type: "number", minimum: 0, maximum: 5 },
            specifications: { type: "object" },
        },
    },
    orderCreate: {
        type: "object", additionalProperties: false, required: ["items"],
        properties: {
            items: { type: "array", minItems: 1, maxItems: 50, items: {
                type: "object", additionalProperties: false, required: ["productId", "quantity"],
                properties: { productId: { type: "string", minLength: 1 }, quantity: { type: "integer", minimum: 1 } },
            } },
            shippingAddress: { type: "object" },
            paymentMethod: { type: "string", enum: ["UPI", "CARD", "COD"] },
            couponCode: { type: "string", minLength: 3, maxLength: 32, pattern: "^[A-Za-z0-9_-]+$" },
        },
    },
    paymentCreate: {
        type: "object", additionalProperties: false, required: ["orderId", "amount", "paymentMethod"],
        properties: {
            orderId: { type: "string", minLength: 1 },
            amount: { type: "number", exclusiveMinimum: 0 },
            paymentMethod: { type: "string", enum: ["UPI", "CARD", "COD"] },
        },
    },
    cartItem: {
        type: "object", additionalProperties: false, required: ["productId"],
        properties: { productId: { type: "string", minLength: 1 }, quantity: { type: "integer", minimum: 1 } },
    },
    login: {
        type: "object", additionalProperties: false, required: ["email", "password"],
        properties: { email: { type: "string", pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" }, password: { type: "string", minLength: 1 } },
    },
    superAdminCode: {
        type: "object", additionalProperties: false, required: ["challengeId", "code"],
        properties: { challengeId: { type: "string", minLength: 40, maxLength: 64 }, code: { type: "string", pattern: "^\\d{6}$" } },
    },
    emailToken: { type: "object", additionalProperties: false, required: ["token"], properties: { token: { type: "string", minLength: 32, maxLength: 128 } } },
    registration: {
        type: "object", additionalProperties: false, required: ["name", "email", "password"],
        properties: { name: { type: "string", minLength: 1, maxLength: 200 }, email: { type: "string", pattern: "^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$" }, password: { type: "string", minLength: 8 } },
    },
};

const validators = Object.fromEntries(Object.entries(schemas).map(([name, schema]) => [name, ajv.compile(schema)]));

function validateBody(schemaName) {
    return (req, res, next) => {
        const validate = validators[schemaName];
        if (validate(req.body)) return next();
        const errorsList = (validate.errors || []).map((err) => ({
            field: err.instancePath ? err.instancePath.replace(/^\//, "").replace(/\//g, ".") : (err.params?.missingProperty || "body"),
            message: err.message,
            keyword: err.keyword,
        }));
        const details = errorsList.map((e) => `${e.field}: ${e.message}`).join("; ");
        const validationError = new Error(`Invalid request body: ${details}`);
        validationError.status = 400;
        validationError.type = "validation-error";
        validationError.errors = errorsList;
        return next(validationError);
    };
}

module.exports = { ajv, schemas, validateBody };
