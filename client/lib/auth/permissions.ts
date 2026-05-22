export function hasPermission(
  permissions: string[],
  permission: string
) {
  return permissions.includes(permission);
}

export function hasAnyPermission(
  permissions: string[],
  required: string[]
) {
  return required.some((p) => permissions.includes(p));
}