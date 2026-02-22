export const ROLES = {
  owner: [
    "dashboard.access",
    "products.read",
    "products.write",
    "orders.read",
    "orders.manage",
    "users.manage"
  ],
  admin: [
    "dashboard.access",
    "products.read",
    "products.write",
    "orders.read"
  ],
  editor: [
    "dashboard.access",
    "products.read"
  ]
} as const;

export type Role = keyof typeof ROLES;