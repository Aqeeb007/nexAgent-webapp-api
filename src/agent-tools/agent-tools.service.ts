import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  type Transaction,
  DATABASE,
} from '../database/database.module';
import { agentTools } from '../database/schema/agent-tools';
import { tools } from '../database/schema/tools';

import { AgentsService } from '../agents/agents.service';
import { ToolsService } from '../tools/tools.service';

import { isUniqueConstraintViolation } from '../common/utils/postgres-error.util';

@Injectable()
export class AgentToolsService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
    private readonly agentsService: AgentsService,
    private readonly toolsService: ToolsService,
  ) {}

  async attach(
    agentId: string,
    toolId: string,
    organizationId: string,
    tx?: Transaction,
  ) {
    const executor = tx ?? this.db;

    const agent = await this.agentsService.findOne(agentId, organizationId);

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const tool = await this.toolsService.findOne(toolId, organizationId);

    if (!tool) {
      throw new NotFoundException('Tool not found');
    }

    try {
      const [attachment] = await executor
        .insert(agentTools)
        .values({
          organizationId,
          agentId,
          toolId,
        })
        .returning({
          id: agentTools.id,
          agentId: agentTools.agentId,
          toolId: agentTools.toolId,
          createdAt: agentTools.createdAt,
        });

      return attachment;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException('Tool is already attached to this agent');
      }

      throw error;
    }
  }

  async list(agentId: string, organizationId: string) {
    const agent = await this.agentsService.findOne(agentId, organizationId);

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    return this.db
      .select({
        id: tools.id,
        name: tools.name,
        type: tools.type,
        attachedAt: agentTools.createdAt,
      })
      .from(agentTools)
      .innerJoin(tools, eq(agentTools.toolId, tools.id))
      .where(
        and(
          eq(agentTools.agentId, agentId),
          eq(agentTools.organizationId, organizationId),
        ),
      );
  }

  // Internal use only (ChatService) — full tool rows including config and
  // the LLM-facing description/parameters, unlike the curated public
  // list() above. Chat-time access to this is separately gated on
  // TOOL_EXECUTE by the caller (see ChatService), not by what this method
  // exposes, so returning full rows here is fine.
  async listFull(agentId: string, organizationId: string) {
    const agent = await this.agentsService.findOne(agentId, organizationId);

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    return this.db
      .select({
        id: tools.id,
        name: tools.name,
        type: tools.type,
        config: tools.config,
        description: tools.description,
        parameters: tools.parameters,
      })
      .from(agentTools)
      .innerJoin(tools, eq(agentTools.toolId, tools.id))
      .where(
        and(
          eq(agentTools.agentId, agentId),
          eq(agentTools.organizationId, organizationId),
        ),
      );
  }

  async detach(agentId: string, toolId: string, organizationId: string) {
    const result = await this.db
      .delete(agentTools)
      .where(
        and(
          eq(agentTools.agentId, agentId),
          eq(agentTools.toolId, toolId),
          eq(agentTools.organizationId, organizationId),
        ),
      )
      .returning({ id: agentTools.id });

    return result[0] ?? null;
  }
}
