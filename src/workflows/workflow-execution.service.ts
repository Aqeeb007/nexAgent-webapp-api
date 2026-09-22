import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';

import { type Database, DATABASE } from '../database/database.module';
import { workflowRuns } from '../database/schema/workflow-runs';
import { workflowStepRuns } from '../database/schema/workflow-step-runs';

import { WorkflowsService } from './workflows.service';
import { WorkflowStepExecutorRegistry } from './execution/workflow-step-executor.registry';

type WorkflowStepRow = Awaited<
  ReturnType<WorkflowsService['listSteps']>
>[number];
type WorkflowEdgeRow = Awaited<
  ReturnType<WorkflowsService['listEdges']>
>[number];

const RUN_COLUMNS = {
  id: workflowRuns.id,
  workflowId: workflowRuns.workflowId,
  triggeredByUserId: workflowRuns.triggeredByUserId,
  status: workflowRuns.status,
  input: workflowRuns.input,
  output: workflowRuns.output,
  error: workflowRuns.error,
  startedAt: workflowRuns.startedAt,
  completedAt: workflowRuns.completedAt,
};

const STEP_RUN_COLUMNS = {
  id: workflowStepRuns.id,
  workflowRunId: workflowStepRuns.workflowRunId,
  workflowStepId: workflowStepRuns.workflowStepId,
  sequence: workflowStepRuns.sequence,
  status: workflowStepRuns.status,
  input: workflowStepRuns.input,
  output: workflowStepRuns.output,
  error: workflowStepRuns.error,
  createdAt: workflowStepRuns.createdAt,
};

// The run loop — mirrors ChatService's round loop in shape (never one big
// DB transaction, since that would hold a connection open across slow
// external calls to OpenAI/tool targets; each step run is persisted as it
// completes instead) and ToolsService.execute's choke-point logging.
@Injectable()
export class WorkflowExecutionService {
  private readonly logger = new Logger(WorkflowExecutionService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly workflowsService: WorkflowsService,
    private readonly registry: WorkflowStepExecutorRegistry,
  ) {}

  async execute(
    workflowId: string,
    organizationId: string,
    userId: string,
    input?: Record<string, unknown>,
  ) {
    const workflow = await this.workflowsService.findOne(
      workflowId,
      organizationId,
    );

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const [steps, edges] = await Promise.all([
      this.workflowsService.listSteps(workflowId, organizationId),
      this.workflowsService.listEdges(workflowId, organizationId),
    ]);

    if (steps.length === 0) {
      throw new BadRequestException('Workflow has no steps to execute');
    }

    if (!workflow.entryStepId) {
      throw new BadRequestException('Workflow has no entry step set');
    }

    const stepsById = new Map(steps.map((step) => [step.id, step]));
    const edgesByFromStepId = new Map<string, WorkflowEdgeRow[]>();
    for (const edge of edges) {
      const outgoing = edgesByFromStepId.get(edge.fromStepId) ?? [];
      outgoing.push(edge);
      edgesByFromStepId.set(edge.fromStepId, outgoing);
    }

    const [run] = await this.db
      .insert(workflowRuns)
      .values({
        workflowId,
        triggeredByUserId: userId,
        status: 'running',
        input,
      })
      .returning(RUN_COLUMNS);

    let currentInput: unknown = input ?? {};
    let runStatus: 'completed' | 'failed' = 'completed';
    let runError: string | undefined;
    let currentStepId: string | null = workflow.entryStepId;
    const visited = new Set<string>();
    // Acyclic by construction (WorkflowsService.addEdge rejects any edge
    // that would close a cycle) — this cap is a defensive backstop, same
    // spirit as ChatService's MAX_TOOL_ROUNDS: never fully trust a single
    // validation layer for something that could otherwise hang.
    const maxSteps = steps.length + 1;

    while (currentStepId && visited.size < maxSteps) {
      if (visited.has(currentStepId)) {
        runStatus = 'failed';
        runError = `Cycle detected at step ${currentStepId}`;
        break;
      }
      visited.add(currentStepId);

      const step: WorkflowStepRow | undefined = stepsById.get(currentStepId);

      if (!step) {
        break;
      }

      try {
        const executor = this.registry.get(step.type);
        const { output } = await executor.execute(step.config, currentInput, {
          organizationId,
          userId,
        });

        await this.db.insert(workflowStepRuns).values({
          workflowRunId: run.id,
          workflowStepId: step.id,
          status: 'success',
          input: this.toJsonb(currentInput),
          output: this.toJsonb(output),
        });

        currentInput = output;
        currentStepId = this.resolveNextStepId(step, output, edgesByFromStepId);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        this.logger.warn(
          `Workflow "${workflow.name}" (id=${workflowId}) step ${step.id} (${step.type}) failed: ${message}`,
        );

        await this.db.insert(workflowStepRuns).values({
          workflowRunId: run.id,
          workflowStepId: step.id,
          status: 'failed',
          input: this.toJsonb(currentInput),
          error: message,
        });

        runStatus = 'failed';
        runError = message;
        currentStepId = null;
      }
    }

    // Every step in the workflow gets a recorded outcome for this run, not
    // just the ones on the path taken — steps never reached (a different
    // branch, or downstream of a failure) are recorded 'skipped'.
    const skipped = steps.filter((step) => !visited.has(step.id));

    if (skipped.length > 0) {
      await this.db.insert(workflowStepRuns).values(
        skipped.map((step) => ({
          workflowRunId: run.id,
          workflowStepId: step.id,
          status: 'skipped' as const,
        })),
      );
    }

    const [updatedRun] = await this.db
      .update(workflowRuns)
      .set({
        status: runStatus,
        output: this.toJsonb(currentInput),
        error: runError,
        completedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(workflowRuns.id, run.id))
      .returning(RUN_COLUMNS);

    return updatedRun;
  }

  async listRuns(workflowId: string, organizationId: string) {
    const workflow = await this.workflowsService.findOne(
      workflowId,
      organizationId,
    );

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    return this.db
      .select(RUN_COLUMNS)
      .from(workflowRuns)
      .where(eq(workflowRuns.workflowId, workflowId))
      .orderBy(asc(workflowRuns.startedAt));
  }

  async getRun(workflowId: string, runId: string, organizationId: string) {
    const workflow = await this.workflowsService.findOne(
      workflowId,
      organizationId,
    );

    if (!workflow) {
      throw new NotFoundException('Workflow not found');
    }

    const result = await this.db
      .select(RUN_COLUMNS)
      .from(workflowRuns)
      .where(
        and(
          eq(workflowRuns.id, runId),
          eq(workflowRuns.workflowId, workflowId),
        ),
      )
      .limit(1);

    const run = result[0] ?? null;

    if (!run) {
      return null;
    }

    const stepRuns = await this.db
      .select(STEP_RUN_COLUMNS)
      .from(workflowStepRuns)
      .where(eq(workflowStepRuns.workflowRunId, run.id))
      .orderBy(asc(workflowStepRuns.sequence));

    return { ...run, stepRuns };
  }

  // workflow_runs.output / workflow_step_runs.input|output are typed jsonb
  // objects, but a step's `output`/pipeline `input` can legitimately be a
  // primitive (e.g. an agent step's {content: string} is an object, but a
  // condition step's raw `actual` isn't stored — this wraps any
  // non-object value so it round-trips through the jsonb column without
  // the column's TS type lying about what can be in it).
  private toJsonb(value: unknown): Record<string, unknown> | undefined {
    if (value === undefined) {
      return undefined;
    }

    if (typeof value === 'object' && value !== null) {
      return value as Record<string, unknown>;
    }

    return { value };
  }

  // A condition step routes to the outgoing edge whose branch matches its
  // output.branch, falling back to a 'default'-branched edge if present;
  // any other step type just follows its one 'default' edge (enforced at
  // edge-creation time via the workflow_step_edge_branch_unique
  // constraint). No matching edge either way means this path ends here —
  // not an error, just a normal terminal step.
  private resolveNextStepId(
    step: Pick<WorkflowStepRow, 'id' | 'type'>,
    output: unknown,
    edgesByFromStepId: Map<string, WorkflowEdgeRow[]>,
  ): string | null {
    const outgoing = edgesByFromStepId.get(step.id) ?? [];

    if (step.type !== 'condition') {
      return (
        outgoing.find((edge) => edge.branch === 'default')?.toStepId ?? null
      );
    }

    const branch =
      typeof output === 'object' && output !== null
        ? ((output as { branch?: string | null }).branch ?? 'default')
        : 'default';

    const matched = outgoing.find((edge) => edge.branch === branch);

    if (matched) {
      return matched.toStepId;
    }

    if (branch !== 'default') {
      const fallback = outgoing.find((edge) => edge.branch === 'default');

      if (fallback) {
        return fallback.toStepId;
      }
    }

    return null;
  }
}
