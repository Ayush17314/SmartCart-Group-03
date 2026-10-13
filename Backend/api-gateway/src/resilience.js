class CircuitOpenError extends Error {
    constructor(service) { super(`${service} is temporarily unavailable`); this.status = 503; this.code = "CIRCUIT_OPEN"; }
}

class CircuitBreaker {
    constructor({ failureThreshold = 5, resetTimeoutMs = 15_000 } = {}) {
        this.failureThreshold = failureThreshold;
        this.resetTimeoutMs = resetTimeoutMs;
        this.states = new Map();
    }

    stateFor(service) {
        if (!this.states.has(service)) this.states.set(service, { failures: 0, openedAt: 0, halfOpen: false });
        return this.states.get(service);
    }

    async execute(service, operation) {
        const state = this.stateFor(service);
        if (state.openedAt) {
            if (Date.now() - state.openedAt < this.resetTimeoutMs || state.halfOpen) throw new CircuitOpenError(service);
            state.halfOpen = true;
        }
        try {
            const result = await operation();
            state.failures = 0;
            state.openedAt = 0;
            state.halfOpen = false;
            return result;
        } catch (error) {
            state.halfOpen = false;
            if (isTransientFailure(error)) {
                state.failures += 1;
                if (state.failures >= this.failureThreshold) state.openedAt = Date.now();
            }
            throw error;
        }
    }
}

function isTransientFailure(error) {
    return !error.response || error.response.status >= 500 || error.code === "ECONNABORTED";
}

function wait(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function retryWithBackoff(operation, { retries = 2, baseDelayMs = 250 } = {}) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
        try { return await operation(); }
        catch (error) {
            lastError = error;
            if (attempt >= retries || !isTransientFailure(error)) break;
            const delay = baseDelayMs * (2 ** attempt) + Math.floor(Math.random() * Math.max(1, baseDelayMs));
            await wait(delay);
        }
    }
    throw lastError;
}

module.exports = { CircuitBreaker, CircuitOpenError, retryWithBackoff, isTransientFailure };
