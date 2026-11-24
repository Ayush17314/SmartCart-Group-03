const { fork } = require("child_process");
const path = require("path");

// Clean up ports if lingering processes exist
try {
  require("./free-ports");
} catch (e) {
  // Ignore
}

const services = [
  { name: "auth-service", script: path.join(__dirname, "auth-service", "src", "server.js") },
  { name: "product-service", script: path.join(__dirname, "product-service", "src", "server.js") },
  { name: "cart-service", script: path.join(__dirname, "cart-service", "src", "server.js") },
  { name: "wishlist-service", script: path.join(__dirname, "wishlist-service", "src", "server.js") },
  { name: "order-service", script: path.join(__dirname, "order-service", "src", "server.js") },
  { name: "payment-service", script: path.join(__dirname, "payment-service", "src", "server.js") },
  { name: "notification-service", script: path.join(__dirname, "notification-service", "src", "server.js") },
  { name: "api-gateway", script: path.join(__dirname, "api-gateway", "src", "server.js") },
];

console.log("[start-all] Starting 8 SmartCart microservices with direct low-memory forks (max 40MB per worker)...");

const children = [];

for (const s of services) {
  const child = fork(s.script, [], {
    cwd: path.dirname(path.dirname(s.script)),
    execArgv: ["--max-old-space-size=40"],
    stdio: "inherit",
    env: process.env,
  });

  child.on("exit", (code, signal) => {
    console.warn(`[start-all] ${s.name} exited with code ${code} signal ${signal}`);
  });

  children.push(child);
}

function shutdown() {
  console.log("[start-all] Shutting down services...");
  for (const c of children) {
    try {
      c.kill("SIGTERM");
    } catch {}
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
