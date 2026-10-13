const test = require("node:test");
const assert = require("node:assert/strict");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { app, User, AuditEvent, LoginChallenge, currentUserFromToken } = require("../src/server");

const password = "Valid-login-password-123";
const passwordHash = bcrypt.hashSync(password, 4);
const accounts = new Map([
  ["customer@example.com", { _id: "c1", name: "Customer", email: "customer@example.com", role: "customer", isActive: true, emailVerified: true, tokenVersion: 0, password: passwordHash }],
  ["support@example.com", { _id: "s1", name: "Support", email: "support@example.com", role: "support", isActive: true, emailVerified: true, tokenVersion: 0, password: passwordHash }],
  ["inventory@example.com", { _id: "i1", name: "Inventory", email: "inventory@example.com", role: "inventory_staff", isActive: true, emailVerified: true, tokenVersion: 0, password: passwordHash }],
  ["manager@example.com", { _id: "m1", name: "Manager", email: "manager@example.com", role: "admin", isActive: true, emailVerified: true, tokenVersion: 0, password: passwordHash }],
  ["root@example.com", { _id: "r1", name: "Root", email: "root@example.com", role: "super_admin", isActive: true, emailVerified: true, tokenVersion: 0, password: passwordHash }],
  ["disabled@example.com", { _id: "d1", name: "Disabled", email: "disabled@example.com", role: "customer", isActive: false, emailVerified: true, tokenVersion: 0, password: passwordHash }],
]);

let server;
let baseUrl;
let activeChallenge;

test.before(async () => {
  process.env.JWT_SECRET = "test-auth-login-secret-at-least-32-chars";
  User.findOne = (filter) => ({ select: async () => accounts.get(filter.email) || null });
  User.findById = async (id) => [...accounts.values()].find((account) => account._id === id) || null;
  AuditEvent.create = async () => ({});
  LoginChallenge.create = async (record) => { activeChallenge = { _id: "challenge-1", ...record }; return activeChallenge; };
  LoginChallenge.findOne = (filter) => ({ select: async () => activeChallenge && activeChallenge.challengeIdHash === filter.challengeIdHash && !activeChallenge.consumedAt && activeChallenge.expiresAt > new Date() && activeChallenge.attempts < 5 ? activeChallenge : null });
  LoginChallenge.updateOne = async (filter, update) => {
    if (!activeChallenge || activeChallenge._id !== filter._id || activeChallenge.consumedAt || activeChallenge.attempts !== filter.attempts) return { modifiedCount: 0 };
    if (update.$inc) activeChallenge.attempts += update.$inc.attempts;
    if (update.$set) activeChallenge.consumedAt = update.$set.consumedAt;
    return { modifiedCount: 1 };
  };
  server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function login(portal, email, body = {}) {
  const path = portal === "super_admin" ? "super-admin" : portal;
  const response = await fetch(`${baseUrl}/api/auth/${path}-login`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, ...body }),
  });
  return { status: response.status, body: await response.json() };
}

test("each portal accepts only its intended active, verified role", async () => {
  assert.equal((await login("customer", "customer@example.com")).status, 200);
  assert.equal((await login("staff", "support@example.com")).status, 200);
  assert.equal((await login("staff", "inventory@example.com")).status, 200);
  assert.equal((await login("staff", "manager@example.com")).status, 200);
  assert.equal((await login("super_admin", "root@example.com")).status, 200);
});

test("Super Admin login is exact-role only and role fields cannot elevate a customer", async () => {
  const elevated = await login("customer", "customer@example.com", { role: "super_admin" });
  assert.equal(elevated.status, 200);
  assert.equal(elevated.body.data.user.role, "customer");
  assert.equal((await login("super_admin", "manager@example.com")).status, 403);
});

test("wrong portal, invalid credentials, and suspended accounts are rejected", async () => {
  assert.equal((await login("customer", "support@example.com")).status, 403);
  assert.equal((await login("staff", "customer@example.com")).status, 403);
  assert.equal((await login("customer", "customer@example.com", { password: "wrong-password" })).status, 401);
  assert.equal((await login("customer", "disabled@example.com")).status, 401);
  assert.equal((await login("customer", "unknown@example.com")).status, 401);
});

test("session validation requires a signed, unexpired token and trusts the database role", async () => {
  assert.equal(await currentUserFromToken({ get: () => "" }), null);
  assert.equal(await currentUserFromToken({ get: () => "Bearer forged-token" }), null);
  const expired = jwt.sign({ userId: "c1", tokenVersion: 0 }, process.env.JWT_SECRET, { expiresIn: -1 });
  assert.equal(await currentUserFromToken({ get: () => `Bearer ${expired}` }), null);
  const forgedRole = jwt.sign({ userId: "c1", tokenVersion: 0, role: "super_admin" }, process.env.JWT_SECRET, { expiresIn: "1m" });
  const verified = await currentUserFromToken({ get: () => `Bearer ${forgedRole}` });
  assert.equal(verified.principal.role, "customer");
});

test("Super Admin password login creates no session until a one-time email code is verified", async () => {
  const challengeResponse = await fetch(`${baseUrl}/api/auth/super-admin-login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "root@example.com", password }) });
  const challengeBody = await challengeResponse.json();
  assert.equal(challengeResponse.status, 200);
  assert.equal(challengeBody.data.mfaRequired, true);
  assert.equal(challengeBody.data.token, undefined);
  assert.match(challengeBody.data.developmentCodePreview, /^\d{6}$/);

  const verify = (code) => fetch(`${baseUrl}/api/auth/super-admin-verify`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ challengeId: challengeBody.data.challengeId, code }) });
  const wrongCode = challengeBody.data.developmentCodePreview === "000000" ? "000001" : "000000";
  assert.equal((await verify(wrongCode)).status, 401);
  const verified = await verify(challengeBody.data.developmentCodePreview);
  const verifiedBody = await verified.json();
  assert.equal(verified.status, 200);
  assert.equal(verifiedBody.data.user.role, "super_admin");
  assert.equal(verifiedBody.data.token, undefined);
  assert.equal((await verify(challengeBody.data.developmentCodePreview)).status, 401);
});
