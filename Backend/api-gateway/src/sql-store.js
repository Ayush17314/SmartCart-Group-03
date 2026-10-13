const mysql = require("mysql2/promise");

const memory = new Map();
let pool;
let useMemory = process.env.NODE_ENV === "test" || process.env.IDEMPOTENCY_STORE === "memory";

async function initializeSqlStore() {
    if (useMemory) return;
    try {
        pool = mysql.createPool({
            host: process.env.SQL_HOST || "localhost",
            port: Number(process.env.SQL_PORT) || 3306,
            user: process.env.SQL_USER || "smartcart",
            password: process.env.SQL_PASSWORD,
            database: process.env.SQL_DATABASE || "smartcart",
            waitForConnections: true,
            connectionLimit: Number(process.env.SQL_POOL_SIZE) || 10,
            queueLimit: 0,
        });
        await pool.query(`CREATE TABLE IF NOT EXISTS api_idempotency (
            scope_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            idempotency_key VARCHAR(200) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            route_path VARCHAR(512) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            http_method VARCHAR(10) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            request_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
            response_status SMALLINT NULL,
            response_body MEDIUMTEXT NULL,
            completed BOOLEAN NOT NULL DEFAULT FALSE,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (scope_hash, idempotency_key, route_path, http_method)
        )`);
        await pool.query(`CREATE TABLE IF NOT EXISTS api_audit (
            id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
            request_id VARCHAR(100) NOT NULL,
            http_method VARCHAR(10) NOT NULL,
            route_path VARCHAR(512) NOT NULL,
            status_code SMALLINT NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_api_audit_created_at (created_at)
        )`);
        await pool.execute("DELETE FROM api_idempotency WHERE created_at < DATE_SUB(NOW(), INTERVAL 7 DAY)");
    } catch (err) {
        if (process.env.NODE_ENV !== "production") {
            console.warn(JSON.stringify({ level: "warn", service: "api-gateway", message: "MySQL connection failed in development; falling back to in-memory idempotency store", error: err.message }));
            useMemory = true;
            return;
        }
        throw err;
    }
}

function compositeKey(scopeHash, idempotencyKey, routePath, method) {
    return [scopeHash, idempotencyKey, routePath, method].join("\u001f");
}

async function claimIdempotency({ scopeHash, idempotencyKey, routePath, method, requestHash }) {
    if (useMemory) {
        const key = compositeKey(scopeHash, idempotencyKey, routePath, method);
        const existing = memory.get(key);
        if (existing) {
            if (existing.requestHash !== requestHash) return { state: "conflict" };
            return existing.completed ? { state: "replay", status: existing.status, body: existing.body } : { state: "in_progress" };
        }
        memory.set(key, { requestHash, completed: false });
        return { state: "claimed" };
    }
    try {
        await pool.execute(
            "INSERT INTO api_idempotency (scope_hash,idempotency_key,route_path,http_method,request_hash) VALUES (?,?,?,?,?)",
            [scopeHash, idempotencyKey, routePath, method, requestHash],
        );
        return { state: "claimed" };
    } catch (error) {
        if (error.code !== "ER_DUP_ENTRY") throw error;
        const [rows] = await pool.execute(
            "SELECT request_hash,response_status,response_body,completed FROM api_idempotency WHERE scope_hash=? AND idempotency_key=? AND route_path=? AND http_method=?",
            [scopeHash, idempotencyKey, routePath, method],
        );
        const row = rows[0];
        if (!row) throw error;
        if (row.request_hash !== requestHash) return { state: "conflict" };
        if (!row.completed) return { state: "in_progress" };
        return { state: "replay", status: row.response_status, body: JSON.parse(row.response_body) };
    }
}

async function completeIdempotency({ scopeHash, idempotencyKey, routePath, method, status, body }) {
    if (useMemory) {
        const record = memory.get(compositeKey(scopeHash, idempotencyKey, routePath, method));
        if (record) Object.assign(record, { status, body, completed: true });
        return;
    }
    await pool.execute(
        "UPDATE api_idempotency SET response_status=?,response_body=?,completed=TRUE WHERE scope_hash=? AND idempotency_key=? AND route_path=? AND http_method=?",
        [status, JSON.stringify(body), scopeHash, idempotencyKey, routePath, method],
    );
}

async function releaseIdempotency({ scopeHash, idempotencyKey, routePath, method }) {
    if (useMemory) {
        memory.delete(compositeKey(scopeHash, idempotencyKey, routePath, method));
        return;
    }
    await pool.execute(
        "DELETE FROM api_idempotency WHERE scope_hash=? AND idempotency_key=? AND route_path=? AND http_method=? AND completed=FALSE",
        [scopeHash, idempotencyKey, routePath, method],
    );
}

async function writeAudit({ requestId, method, routePath, status }) {
    if (useMemory) return;
    await pool.execute(
        "INSERT INTO api_audit (request_id,http_method,route_path,status_code) VALUES (?,?,?,?)",
        [requestId, method, routePath, status],
    );
}

async function closeSqlStore() {
    if (pool) await pool.end();
}

module.exports = { initializeSqlStore, claimIdempotency, completeIdempotency, releaseIdempotency, writeAudit, closeSqlStore };
