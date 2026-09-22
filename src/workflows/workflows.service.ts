import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';

import { type Database, DATABASE } from '../database/database.module';
import { workflows } from '../database/schema/workflows';
import { workflowSteps } from '../database/schema/workflow-steps';
import { workflowStepEdges } from '../database/schema/workflow-step-edges';
import { isUniqueConstraintViolation } from '../common/utils/postgres-error.util';

export interface WorkflowInput {
  name: string;
  description?: string;
  entryStepId?: string;
}

export interface WorkflowStepInput {
  type: string;
  config: Record<string, unknown>;
  stepOrder?: number;
}

export interface WorkflowEdgeInput {
  fromStepId: string;
  toStepId: string;
  branch?: string;
}

const WORKFLOW_COLUMNS = {
  id: workflows.id,
  organizationId: workflows.organizationId,
  name: workflows.name,
  description: workflows.description,
  entryStepId: workflows.entryStepId,
  createdAt: workflows.createdAt,
  updatedAt: workflows.updatedAt,
};

const WORKFLOW_STEP_COLUMNS = {
  id: workflowSteps.id,
  workflowId: workflowSteps.workflowId,
  stepOrder: workflowSteps.stepOrder,
  type: workflowSteps.type,
  config: workflowSteps.config,
  createdAt: workflowSteps.createdAt,
  updatedAt: workflowSteps.updatedAt,
};

const WORKFLOW_STEP_EDGE_COLUMNS = {
  id: workflowStepEdges.id,
  workflowId: workflowStepEdges.workflowId,
  fromStepId: workflowStepEdges.fromStepId,
  toStepId: workflowStepEdges.toStepId,
  branch: workflowStepEdges.branch,
  createdAt: workflowStepEdges.createdAt,
};

@Injectable()
export class WorkflowsService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
  ) {}

  async create(organizationId: string, data: WorkflowInput) {
    const [workflow] = await this.db
      .insert(workflows)
      .values({
        organizationId,
        name: data.name,
        description: data.description,
      })
      .returning(WORKFLOW_COLUMNS);

    return workflow;
  }

  async findAllForOrganization(organizationId: string) {
    return this.db
      .select(WORKFLOW_COLUMNS)
      .from(workflows)
      .where(eq(workflows.organizationId, organizationId));
  }

  async findOne(id: string, organizationId: string) {
    const result = await this.db
      .select(WORKFLOW_COLUMNS)
      .from(workflows)
      .where(
        and(eq(workflows.id, id), eq(workflows.organizationId, organizationId)),
      )
      .limit(1);

    return result[0] ?? null;
  }

  async update(
    id: string,
    organizationId: string,
    data: Partial<WorkflowInput>,
  ) {
    if (data.entryStepId) {
      const step = await this.getStep(id, data.entryStepId, organizationId);

      if (!step) {
        throw new NotFoundException('Entry step not found in this workflow');
      }
    }

    const result = await this.db
      .update(workflows)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(eq(workflows.id, id), eq(workflows.organizationId, organizationId)),
      )
      .returning(WORKFLOW_COLUMNS);

    return result[0] ?? null;
  }

  async remove(id: string, organizationId: string) {
    const result = await this.db
      .delete(workflows)
      .where(
        and(eq(workflows.id, id), eq(workflows.organizationId, organizationId)),
      )
      .returning({ id: workflows.id });

    return result[0] ?? null;
  }

  async addStep(
    workflowId: string,
    organizationId: string,
    data: WorkflowStepInput,
  ) {
    const workflow = await this.findOne(workflowId, organizationId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const isFirstStep = !workflow.entryStepId;
    const stepOrder = data.stepOrder ?? (await this.nextStepOrder(workflowId));

    const [step] = await this.db
      .insert(workflowSteps)
      .values({
        workflowId,
        type: data.type,
        config: data.config,
        stepOrder,
      })
      .returning(WORKFLOW_STEP_COLUMNS);

    // A workflow with no entry step yet gets one automatically from its
    // first added step — no separate "set entry" call needed for the
    // common case of building a workflow from scratch. Overridable later
    // via PATCH /workflows/:id.
    if (isFirstStep) {
      await this.db
        .update(workflows)
        .set({ entryStepId: step.id })
        .where(eq(workflows.id, workflowId));
    }

    return step;
  }

  async listSteps(workflowId: string, organizationId: string) {
    const workflow = await this.findOne(workflowId, organizationId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return this.db
      .select(WORKFLOW_STEP_COLUMNS)
      .from(workflowSteps)
      .where(eq(workflowSteps.workflowId, workflowId))
      .orderBy(asc(workflowSteps.stepOrder));
  }

  async getStep(workflowId: string, stepId: string, organizationId: string) {
    const workflow = await this.findOne(workflowId, organizationId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const result = await this.db
      .select(WORKFLOW_STEP_COLUMNS)
      .from(workflowSteps)
      .where(
        and(
          eq(workflowSteps.id, stepId),
          eq(workflowSteps.workflowId, workflowId),
        ),
      )
      .limit(1);

    return result[0] ?? null;
  }

  async updateStep(
    workflowId: string,
    stepId: string,
    organizationId: string,
    data: Partial<WorkflowStepInput>,
  ) {
    const workflow = await this.findOne(workflowId, organizationId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const result = await this.db
      .update(workflowSteps)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(workflowSteps.id, stepId),
          eq(workflowSteps.workflowId, workflowId),
        ),
      )
      .returning(WORKFLOW_STEP_COLUMNS);

    return result[0] ?? null;
  }

  async removeStep(workflowId: string, stepId: string, organizationId: string) {
    const workflow = await this.findOne(workflowId, organizationId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const result = await this.db
      .delete(workflowSteps)
      .where(
        and(
          eq(workflowSteps.id, stepId),
          eq(workflowSteps.workflowId, workflowId),
        ),
      )
      .returning({ id: workflowSteps.id });

    return result[0] ?? null;
  }

  async addEdge(
    workflowId: string,
    organizationId: string,
    data: WorkflowEdgeInput,
  ) {
    const workflow = await this.findOne(workflowId, organizationId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    if (data.fromStepId === data.toStepId) {
      throw new BadRequestException('An edge cannot point a step at itself');
    }

    const [fromStep, toStep] = await Promise.all([
      this.getStep(workflowId, data.fromStepId, organizationId),
      this.getStep(workflowId, data.toStepId, organizationId),
    ]);

    if (!fromStep || !toStep) {
      throw new NotFoundException('Step not found in this workflow');
    }

    const wouldCycle = await this.canReach(
      workflowId,
      data.toStepId,
      data.fromStepId,
    );

    if (wouldCycle) {
      throw new BadRequestException('This edge would create a cycle');
    }

    try {
      const [edge] = await this.db
        .insert(workflowStepEdges)
        .values({
          workflowId,
          fromStepId: data.fromStepId,
          toStepId: data.toStepId,
          branch: data.branch,
        })
        .returning(WORKFLOW_STEP_EDGE_COLUMNS);

      return edge;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'A branch already has an outgoing edge from this step',
        );
      }

      throw error;
    }
  }

  async listEdges(workflowId: string, organizationId: string) {
    const workflow = await this.findOne(workflowId, organizationId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return this.db
      .select(WORKFLOW_STEP_EDGE_COLUMNS)
      .from(workflowStepEdges)
      .where(eq(workflowStepEdges.workflowId, workflowId))
      .orderBy(asc(workflowStepEdges.createdAt));
  }

  async removeEdge(workflowId: string, edgeId: string, organizationId: string) {
    const workflow = await this.findOne(workflowId, organizationId);

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const result = await this.db
      .delete(workflowStepEdges)
      .where(
        and(
          eq(workflowStepEdges.id, edgeId),
          eq(workflowStepEdges.workflowId, workflowId),
        ),
      )
      .returning({ id: workflowStepEdges.id });

    return result[0] ?? null;
  }

  // DFS: would `target` be reachable by walking forward from `from`? Used
  // to reject an edge (from -> to) that would close a cycle — called as
  // canReach(workflowId, to, from) before insert, i.e. "can we already get
  // from the new edge's destination back to its source".
  private async canReach(
    workflowId: string,
    from: string,
    target: string,
  ): Promise<boolean> {
    const edges = await this.db
      .select({
        fromStepId: workflowStepEdges.fromStepId,
        toStepId: workflowStepEdges.toStepId,
      })
      .from(workflowStepEdges)
      .where(eq(workflowStepEdges.workflowId, workflowId));

    const adjacency = new Map<string, string[]>();
    for (const edge of edges) {
      const next = adjacency.get(edge.fromStepId) ?? [];
      next.push(edge.toStepId);
      adjacency.set(edge.fromStepId, next);
    }

    const stack = [from];
    const visited = new Set<string>();

    while (stack.length > 0) {
      const current = stack.pop()!;

      if (current === target) {
        return true;
      }

      if (visited.has(current)) {
        continue;
      }
      visited.add(current);

      for (const next of adjacency.get(current) ?? []) {
        stack.push(next);
      }
    }

    return false;
  }

  private async nextStepOrder(workflowId: string): Promise<number> {
    const [result] = await this.db
      .select({
        max: sql<number | null>`max(${workflowSteps.stepOrder})`.mapWith(
          (value: number | null) => value,
        ),
      })
      .from(workflowSteps)
      .where(eq(workflowSteps.workflowId, workflowId));

    return (result?.max ?? -1) + 1;
  }
}
