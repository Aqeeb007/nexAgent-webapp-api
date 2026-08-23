import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  type Transaction,
  DATABASE,
} from '../database/database.module';
import { agents } from '../database/schema/agents';

export interface AgentInput {
  name: string;
  description?: string;
  systemPrompt: string;
  model: string;
  configuration?: Record<string, unknown>;
}

const AGENT_COLUMNS = {
  id: agents.id,
  organizationId: agents.organizationId,
  name: agents.name,
  description: agents.description,
  systemPrompt: agents.systemPrompt,
  model: agents.model,
  configuration: agents.configuration,
  createdAt: agents.createdAt,
  updatedAt: agents.updatedAt,
};

@Injectable()
export class AgentsService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  async create(organizationId: string, data: AgentInput, tx?: Transaction) {
    const executor = tx ?? this.db;

    const [agent] = await executor
      .insert(agents)
      .values({
        organizationId,
        name: data.name,
        description: data.description,
        systemPrompt: data.systemPrompt,
        model: data.model,
        configuration: data.configuration,
      })
      .returning(AGENT_COLUMNS);

    return agent;
  }

  async findAllForOrganization(organizationId: string) {
    return this.db
      .select(AGENT_COLUMNS)
      .from(agents)
      .where(eq(agents.organizationId, organizationId));
  }

  async findOne(id: string, organizationId: string) {
    const result = await this.db
      .select(AGENT_COLUMNS)
      .from(agents)
      .where(and(eq(agents.id, id), eq(agents.organizationId, organizationId)))
      .limit(1);

    return result[0] ?? null;
  }

  async update(id: string, organizationId: string, data: Partial<AgentInput>) {
    const result = await this.db
      .update(agents)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(agents.id, id), eq(agents.organizationId, organizationId)))
      .returning(AGENT_COLUMNS);

    return result[0] ?? null;
  }

  async remove(id: string, organizationId: string) {
    const result = await this.db
      .delete(agents)
      .where(and(eq(agents.id, id), eq(agents.organizationId, organizationId)))
      .returning({ id: agents.id });

    return result[0] ?? null;
  }
}
