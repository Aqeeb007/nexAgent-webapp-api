export const PERMISSIONS = {
  ORGANIZATION_READ: 'organization:read',
  ORGANIZATION_UPDATE: 'organization:update',

  MEMBER_READ: 'member:read',
  MEMBER_INVITE: 'member:invite',
  MEMBER_UPDATE: 'member:update',
  MEMBER_REMOVE: 'member:remove',

  AGENT_CREATE: 'agent:create',
  AGENT_READ: 'agent:read',
  AGENT_UPDATE: 'agent:update',
  AGENT_DELETE: 'agent:delete',

  TOOL_CREATE: 'tool:create',
  TOOL_READ: 'tool:read',
  TOOL_UPDATE: 'tool:update',
  TOOL_DELETE: 'tool:delete',
  TOOL_EXECUTE: 'tool:execute',

  WORKFLOW_CREATE: 'workflow:create',
  WORKFLOW_READ: 'workflow:read',
  WORKFLOW_UPDATE: 'workflow:update',
  WORKFLOW_DELETE: 'workflow:delete',
} as const;

export type PermissionName = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
