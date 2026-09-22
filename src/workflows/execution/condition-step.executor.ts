import { Injectable } from '@nestjs/common';

import type { WorkflowStepExecutor } from './workflow-step-executor.interface';

function readPath(value: unknown, path?: string): unknown {
  if (!path) {
    return value;
  }

  return path.split('.').reduce<unknown>((current, key) => {
    if (current === null || typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[key];
  }, value);
}

function evaluate(
  operator: string,
  actual: unknown,
  expected: unknown,
): boolean {
  switch (operator) {
    case 'equals':
      return actual === expected;
    case 'not_equals':
      return actual !== expected;
    case 'contains':
      if (typeof actual === 'string') {
        return actual.includes(String(expected));
      }
      if (Array.isArray(actual)) {
        return actual.includes(expected);
      }
      return false;
    case 'truthy':
      return Boolean(actual);
    case 'falsy':
      return !actual;
    default:
      return false;
  }
}

interface ConditionCase {
  branch: string;
  operator: string;
  value?: unknown;
}

// Pure — no external calls, no injected services. A switch, not a single
// boolean check: evaluates config.cases in order against the value at
// config.path (or the whole pipeline input if `path` is omitted), and
// returns the first matching case's branch. WorkflowExecutionService
// follows the outgoing edge whose `branch` matches (falling back to a
// 'default'-branched edge, then ending the path) — the halt/route decision
// lives there, not here.
@Injectable()
export class ConditionStepExecutor implements WorkflowStepExecutor {
  execute(
    config: Record<string, unknown>,
    input: unknown,
  ): Promise<{ output: unknown }> {
    const path = config.path as string | undefined;
    const cases = config.cases as ConditionCase[];

    const actual = readPath(input, path);
    const matched = cases.find((c) => evaluate(c.operator, actual, c.value));

    return Promise.resolve({
      output: { branch: matched?.branch ?? null, matched: !!matched },
    });
  }
}
