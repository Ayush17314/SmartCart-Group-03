require("dotenv").config();
const app = require("./app");
const { initializeSqlStore, closeSqlStore } = require("./sql-store");

const port = Number(process.env.PORT) || 4000;

if (process.env.NODE_ENV === "production" && (!process.env.AUTH_EXCHANGE_SECRET || process.env.AUTH_EXCHANGE_SECRET.length < 32 || /change-me|replace-with|local-development/i.test(process.env.AUTH_EXCHANGE_SECRET))) {
    console.error(JSON.stringify({ level: "error", service: "api-gateway", message: "A strong AUTH_EXCHANGE_SECRET is required in production" }));
    process.exit(1);
}

initializeSqlStore().then(() => {
    const server = app.listen(port, () => console.log(JSON.stringify({ level: "info", service: "api-gateway", message: "listening", port })));
    const shutdown = async () => {
        server.close(async () => {
            await closeSqlStore();
            process.exit(0);
        });
    };
    process.on("SIGINT", shutdown);
    process.on("SIGTERM", shutdown);
}).catch((error) => {
    console.error(JSON.stringify({ level: "error", service: "api-gateway", message: "SQL initialization failed", error: error.message }));
    process.exit(1);
});
