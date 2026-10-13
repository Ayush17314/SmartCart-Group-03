const test = require("node:test");
const assert = require("node:assert/strict");
const { ROLES, PERMISSIONS, permissionsFor, hasPermission, portalAllowsRole } = require("../src/permissions");

test("permission catalogue contains only the supported five roles", () => {
  assert.deepEqual(ROLES, ["customer", "support", "inventory_staff", "admin", "super_admin"]);
});

test("ordinary admin permissions exclude refund approval and privileged settings", () => {
  const permissions = permissionsFor("admin");
  assert.ok(permissions.includes("products.write"));
  assert.ok(permissions.includes("orders.manage"));
  assert.ok(!permissions.includes("refunds.approve"));
  assert.ok(!permissions.includes("settings.manage"));
  assert.ok(!permissions.includes("audit.read"));
});

test("super admin receives the explicit catalogue and invalid roles receive none", () => {
  assert.deepEqual(permissionsFor("super_admin"), [...PERMISSIONS]);
  assert.deepEqual(permissionsFor("unknown"), []);
});

test("permission checks require an explicit permission", () => {
  assert.equal(hasPermission({ permissions: ["inventory.read"] }, "inventory.read"), true);
  assert.equal(hasPermission({ permissions: ["inventory.read"] }, "refunds.approve"), false);
  assert.equal(hasPermission(null, "products.read"), false);
});

test("login portals are constrained to their provisioned roles", () => {
  assert.equal(portalAllowsRole("customer", "customer"), true);
  assert.equal(portalAllowsRole("customer", "admin"), false);
  for (const role of ["support", "inventory_staff", "admin"]) assert.equal(portalAllowsRole("staff", role), true);
  assert.equal(portalAllowsRole("staff", "super_admin"), false);
  assert.equal(portalAllowsRole("super_admin", "super_admin"), true);
  assert.equal(portalAllowsRole("super_admin", "admin"), false);
  assert.equal(portalAllowsRole("unknown", "super_admin"), false);
});
