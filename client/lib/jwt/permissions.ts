export const ROLES = {
  owner: [
    "dashboard.access",
    "store.customize",
    "products.read",
    "products.write",
    "orders.read",
    "orders.manage",
    "users.manage",
    "team.manage"
  ],
  admin: [
    "dashboard.access",
    "store.customize",
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