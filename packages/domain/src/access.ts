export const STAFF_ROLES = [
  'SUPPORT',
  'MODERATOR',
  'FINANCE_ADMIN',
  'LOGISTICS_ADMIN',
  'SUPER_ADMIN',
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const PERMISSIONS = [
  'users.read',
  'users.suspend',
  'users.staff',
  'listings.moderate',
  'orders.read',
  'orders.manage',
  'disputes.manage',
  'payments.read',
  'refunds.manage',
  'payouts.manage',
  'commerce.manage',
  'couriers.manage',
  'shipments.manage',
  'riders.manage',
  'policies.manage',
  'reports.read',
  'notifications.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<StaffRole, readonly Permission[]> = {
  SUPPORT: ['users.read', 'orders.read', 'disputes.manage', 'notifications.read'],
  MODERATOR: [
    'users.read',
    'users.suspend',
    'listings.moderate',
    'orders.read',
    'disputes.manage',
    'policies.manage',
    'notifications.read',
  ],
  FINANCE_ADMIN: [
    'users.read',
    'orders.read',
    'payments.read',
    'refunds.manage',
    'payouts.manage',
    'commerce.manage',
    'reports.read',
  ],
  LOGISTICS_ADMIN: [
    'orders.read',
    'couriers.manage',
    'shipments.manage',
    'riders.manage',
    'reports.read',
  ],
  SUPER_ADMIN: PERMISSIONS,
};

export function isStaffRole(value: string): value is StaffRole {
  return (STAFF_ROLES as readonly string[]).includes(value);
}

export function permissionsFor(roles: readonly string[]): Set<Permission> {
  const granted = new Set<Permission>();
  for (const role of roles) {
    if (!isStaffRole(role)) continue;
    for (const permission of ROLE_PERMISSIONS[role]) granted.add(permission);
  }
  return granted;
}

export function can(roles: readonly string[], permission: Permission): boolean {
  return permissionsFor(roles).has(permission);
}

export function passwordIssues(password: string): string[] {
  const issues: string[] = [];
  if (password.length < 10) issues.push('Use at least 10 characters');
  if (!/[A-Za-z]/.test(password)) issues.push('Include a letter');
  if (!/[0-9]/.test(password)) issues.push('Include a number');
  if (password.length > 200) issues.push('Password is too long');
  return issues;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 200;
}
