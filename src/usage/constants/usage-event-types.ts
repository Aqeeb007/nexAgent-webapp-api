export const USAGE_EVENT_TYPES = {
  CHAT_COMPLETION: 'chat_completion',
  EMBEDDING: 'embedding',
  TOOL_EXECUTION: 'tool_execution',
} as const;

export type UsageEventType =
  (typeof USAGE_EVENT_TYPES)[keyof typeof USAGE_EVENT_TYPES];
