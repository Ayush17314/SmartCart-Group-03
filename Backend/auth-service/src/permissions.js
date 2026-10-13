const ROLES = Object.freeze(["customer", "support", "inventory_staff", "admin", "super_admin"]);

const PERMISSIONS = Object.freeze([
  "products.read", "products.write", "inventory.read", "inventory.write",
  "orders.read_own", "orders.read_all", "orders.manage", "customers.read",
  "customers.manage", "returns.review", "refunds.request", "refunds.approve",
  "promotions.manage", "reviews.moderate", "staff.read", "staff.manage",
  "settings.manage", "audit.read", "analytics.read", "notifications.manage",
]);

const ROLE_PERMISSIONS = Object.freeze({
  customer: ["products.read", "orders.read_own", "refunds.request"],
  support: ["products.read", "orders.read_all", "customers.read", "returns.review", "refunds.request", "notifications.manage"],
  inventory_staff: ["products.read", "products.write", "inventory.read", "inventory.write", "orders.read_all"],
  admin: [
    "products.read", "products.write", "inventory.read", "inventory.write",
    "orders.read_own", "orders.read_all", "orders.manage", "customers.read",
    "customers.manage", "returns.review", "refunds.request", "promotions.manage",
    "reviews.moderate", "staff.read", "analytics.read", "notifications.manage",
  ],
  super_admin: [...PERMISSIONS],
});

function permissionsFor(role) {
  if (!ROLES.includes(role)) return [];
  return [...ROLE_PERMISSIONS[role]];
}

function hasPermission(user, permission) {
  return Boolean(user && Array.isArray(user.permissions) && user.permissions.includes(permission));
}

function portalAllowsRole(portal, role) {
  if (portal === "customer") return role === "customer";
  if (portal === "staff") return ["support", "inventory_staff", "admin"].includes(role);
  if (portal === "super_admin") return role === "super_admin";
  return false;
}

module.exports = { ROLES, PERMISSIONS, ROLE_PERMISSIONS, permissionsFor, hasPermission, portalAllowsRole };
