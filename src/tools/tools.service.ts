import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  type Transaction,
  DATABASE,
} from '../database/database.module';
import { tools } from '../database/schema/tools';
import { ToolExecutorRegistry } from './executors/tool-executor.registry';
import type { ToolExecutionResult } from './executors/tool-executor.interface';

export interface ToolInput {
  name: string;
  type: string;
  config: Record<string, unknown>;
  description: string;
  parameters?: Record<string, unknown>;
}

export type { ToolExecutionResult };

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

@Injectable()
export class ToolsService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly executorRegistry: ToolExecutorRegistry,
  ) {}

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
    return this.executorRegistry
      .get(tool.type)
      .execute(tool.config ?? {}, args);
  }
}
