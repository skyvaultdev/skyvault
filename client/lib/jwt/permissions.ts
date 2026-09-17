export const ROLES = {
  owner: [
    "dashboard.access",
    "store.customize",
    "products.read",
    "products.write",
    "orders.read",
    "orders.manage",
    "users.manage",
    "team.manage",
    "chat.access",
    "shipping.manage",
    "shipping.credentials",
    "payments.manage"
  ],
  admin: [
    "dashboard.access",
    "store.customize",
    "products.read",
    "products.write",
    "orders.read",
    "chat.access",
    "shipping.manage",
    "payments.manage"
  ],
  editor: [
    "dashboard.access",
    "products.read"
  ]
} as const;

export type Role = keyof typeof ROLES;