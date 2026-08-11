export const ROLES = {
  OWNER: 'owner',
  ADMIN: 'admin',
  MEMBER: 'member',
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];
