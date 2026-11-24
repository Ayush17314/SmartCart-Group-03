/**
 * RFC 7807 / RFC 9457 Problem Details for Product Service
 * Media Type: application/problem+json
 */

const STATUS_TITLES = {
    400: "Bad Request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not Found",
    406: "Not Acceptable",
    409: "Conflict",
    412: "Precondition Failed",
    422: "Unprocessable Entity",
    429: "Too Many Requests",
    500: "Internal Server Error",
    503: "Service Unavailable",
};

const DEFAULT_TYPES = {
    400: "bad-request",
    401: "authentication-required",
    403: "insufficient-permissions",
    404: "product-not-found",
    406: "not-acceptable",
    409: "conflict",
    412: "precondition-failed",
    422: "validation-error",
    500: "internal-error",
    503: "service-unavailable",
};

function formatType(type, status) {
    const raw = type || DEFAULT_TYPES[status] || "error";
    if (raw.startsWith("http://") || raw.startsWith("https://") || raw.startsWith("urn:")) {
        return raw;
    }
    return `urn:smartcart:error:${raw}`;
}

function problem(res, options = {}) {
    const status = options.status || 500;
    const title = options.title || STATUS_TITLES[status] || "Error";
    const detail = status >= 500 && process.env.NODE_ENV === "production"
        ? "An internal server error occurred"
        : (options.detail || options.message || title);

    const type = formatType(options.type, status);
    const instance = options.instance || (res.req ? (res.req.originalUrl || res.req.url) : undefined);
    const requestId = options.requestId || res.getHeader("X-Request-Id") || (res.req && res.req.requestId);

    const problemDoc = {
        type,
        title,
        status,
        detail,
        ...(instance ? { instance } : {}),
        ...(requestId ? { requestId } : {}),
        success: false,
        message: detail,
        ...(Array.isArray(options.errors) && options.errors.length ? { errors: options.errors } : {}),
        ...(options.extra || {}),
    };

    res.status(status);
    res.type("application/problem+json");
    return res.json(problemDoc);
}

module.exports = { problem, STATUS_TITLES, DEFAULT_TYPES };
