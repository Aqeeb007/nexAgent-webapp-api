import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  type Transaction,
  DATABASE,
} from '../database/database.module';
import { tools } from '../database/schema/tools';
import { HttpToolMethod } from './dto/http-tool-config.dto';

export interface ToolInput {
  name: string;
  type: string;
  config: Record<string, unknown>;
  description: string;
  parameters?: Record<string, unknown>;
}

interface HttpToolConfig {
  url: string;
  method: HttpToolMethod;
  headers?: Record<string, string>;
}

export interface ToolExecutionResult {
  ok: boolean;
  status: number;
  body: unknown;
  truncated?: boolean;
}

const TOOL_COLUMNS = {
  id: tools.id,
  organizationId: tools.organizationId,
  name: tools.name,
  type: tools.type,
  config: tools.config,
  description: tools.description,
  parameters: tools.parameters,
  createdAt: tools.createdAt,
  updatedAt: tools.updatedAt,
};

type ToolRow = typeof tools.$inferSelect;

const EXECUTE_TIMEOUT_MS = 10_000;
const MAX_RESPONSE_BYTES = 256 * 1024;
const BODY_METHODS: HttpToolMethod[] = ['POST', 'PUT', 'PATCH'];

async function readWithLimit(
  response: Response,
  maxBytes: number,
): Promise<{ text: string; truncated: boolean }> {
  const reader = response.body?.getReader();

  if (!reader) {
    return { text: await response.text(), truncated: false };
  }

  const decoder = new TextDecoder();
  let received = 0;
  let text = '';

  while (true) {
    const { done, value } = await reader.read();

    if (done) {
      break;
    }

    received += value.byteLength;

    if (received > maxBytes) {
      await reader.cancel();
      return { text, truncated: true };
    }

    text += decoder.decode(value, { stream: true });
  }

  return { text, truncated: false };
}

@Injectable()
export class ToolsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  async create(organizationId: string, data: ToolInput, tx?: Transaction) {
    const executor = tx ?? this.db;

    const [tool] = await executor
      .insert(tools)
      .values({
        organizationId,
        name: data.name,
        type: data.type,
        config: data.config,
        description: data.description,
        parameters: data.parameters,
      })
      .returning(TOOL_COLUMNS);

    return tool;
  }

  async findAllForOrganization(organizationId: string) {
    return this.db
      .select(TOOL_COLUMNS)
      .from(tools)
      .where(eq(tools.organizationId, organizationId));
  }

  async findOne(id: string, organizationId: string) {
    const result = await this.db
      .select(TOOL_COLUMNS)
      .from(tools)
      .where(and(eq(tools.id, id), eq(tools.organizationId, organizationId)))
      .limit(1);

    return result[0] ?? null;
  }

  async update(id: string, organizationId: string, data: Partial<ToolInput>) {
    const result = await this.db
      .update(tools)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(tools.id, id), eq(tools.organizationId, organizationId)))
      .returning(TOOL_COLUMNS);

    return result[0] ?? null;
  }

  async remove(id: string, organizationId: string) {
    const result = await this.db
      .delete(tools)
      .where(and(eq(tools.id, id), eq(tools.organizationId, organizationId)))
      .returning({ id: tools.id });

    return result[0] ?? null;
  }

  async execute(
    tool: Pick<ToolRow, 'type' | 'config'>,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    if (tool.type !== 'http') {
      throw new Error(`Unsupported tool type: ${tool.type}`);
    }

    // Trusted to match HttpToolConfigDto's shape — config is only ever
    // written through CreateToolDto/UpdateToolDto's nested validation.
    const config = tool.config as unknown as HttpToolConfig;
    const usesBody = BODY_METHODS.includes(config.method);

    const url = new URL(config.url);

    if (!usesBody) {
      for (const [key, value] of Object.entries(args)) {
        url.searchParams.set(
          key,
          typeof value === 'object' && value !== null
            ? JSON.stringify(value)
            : String(value),
        );
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), EXECUTE_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: config.method,
        headers: { 'content-type': 'application/json', ...config.headers },
        body: usesBody ? JSON.stringify(args) : undefined,
        redirect: 'follow',
        signal: controller.signal,
      });

      const { text, truncated } = await readWithLimit(
        response,
        MAX_RESPONSE_BYTES,
      );

      let body: unknown = text;

      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        // Not JSON — keep the raw text.
      }

      return { ok: response.ok, status: response.status, body, truncated };
    } catch (error) {
      return {
        ok: false,
        status: 0,
        body: {
          error: error instanceof Error ? error.message : 'Tool request failed',
        },
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
