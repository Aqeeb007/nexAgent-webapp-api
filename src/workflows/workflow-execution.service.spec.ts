import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';

import { WorkflowExecutionService } from './workflow-execution.service';
import { WorkflowsService } from './workflows.service';
import { WorkflowStepExecutorRegistry } from './execution/workflow-step-executor.registry';
import { DATABASE } from '../database/database.module';

describe('WorkflowExecutionService', () => {
  let service: WorkflowExecutionService;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    orderBy: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    update: jest.Mock;
    set: jest.Mock;
    delete: jest.Mock;
    returning: jest.Mock;
  };
  let mockWorkflowsService: {
    findOne: jest.Mock;
    listSteps: jest.Mock;
    listEdges: jest.Mock;
  };
  let mockRegistry: { get: jest.Mock };
  let agentExecutor: { execute: jest.Mock };
  let toolExecutor: { execute: jest.Mock };
  let conditionExecutor: { execute: jest.Mock };

  const organizationId = 'org-1';
  const userId = 'user-1';
  const workflowId = 'workflow-1';

  const runRow = {
    id: 'run-1',
    workflowId,
    triggeredByUserId: userId,
    status: 'running',
    input: {},
  };

  // mockDb.values is called with either a single insert object or (for the
  // skipped-steps batch) an array of them — this narrows `.mock.calls`
  // (otherwise `any[][]`) once per assertion so the filter/find bodies
  // below don't trip no-unsafe-member-access on `any`.
  type ValuesCallArg = Record<string, unknown> | Record<string, unknown>[];
  function valuesCallArgs(): ValuesCallArg[] {
    return (mockDb.values.mock.calls as unknown as [ValuesCallArg][]).map(
      ([arg]) => arg,
    );
  }
  function stepRunStatuses(): Record<string, unknown>[] {
    return valuesCallArgs()
      .flatMap((arg) => (Array.isArray(arg) ? arg : [arg]))
      .filter((arg): arg is Record<string, unknown> => 'workflowStepId' in arg);
  }
  function statusFor(stepId: string): unknown {
    return stepRunStatuses().find((s) => s.workflowStepId === stepId)?.status;
  }

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      orderBy: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    };

    mockWorkflowsService = {
      findOne: jest.fn(),
      listSteps: jest.fn(),
      listEdges: jest.fn().mockResolvedValue([]),
    };

    agentExecutor = {
      execute: jest.fn().mockResolvedValue({ output: { content: 'summary' } }),
    };
    toolExecutor = {
      execute: jest
        .fn()
        .mockResolvedValue({ output: { ok: true, status: 200, body: {} } }),
    };
    conditionExecutor = {
      execute: jest
        .fn()
        .mockResolvedValue({ output: { branch: null, matched: false } }),
    };

    mockRegistry = {
      get: jest.fn(
        (type: string) =>
          ({
            agent: agentExecutor,
            tool: toolExecutor,
            condition: conditionExecutor,
          })[type],
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WorkflowExecutionService,
        { provide: DATABASE, useValue: mockDb },
        { provide: WorkflowsService, useValue: mockWorkflowsService },
        { provide: WorkflowStepExecutorRegistry, useValue: mockRegistry },
      ],
    }).compile();

    service = module.get<WorkflowExecutionService>(WorkflowExecutionService);
  });

  describe('execute', () => {
    it('throws NotFoundException when the workflow does not exist', async () => {
      mockWorkflowsService.findOne.mockResolvedValueOnce(null);

      await expect(
        service.execute(workflowId, organizationId, userId),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when the workflow has no steps', async () => {
      mockWorkflowsService.findOne.mockResolvedValueOnce({
        id: workflowId,
        name: 'Empty',
        entryStepId: null,
      });
      mockWorkflowsService.listSteps.mockResolvedValueOnce([]);

      await expect(
        service.execute(workflowId, organizationId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when no entry step is set', async () => {
      mockWorkflowsService.findOne.mockResolvedValueOnce({
        id: workflowId,
        name: 'No entry',
        entryStepId: null,
      });
      mockWorkflowsService.listSteps.mockResolvedValueOnce([
        { id: 'step-1', type: 'agent', config: {} },
      ]);

      await expect(
        service.execute(workflowId, organizationId, userId),
      ).rejects.toThrow(BadRequestException);
    });

    it('walks a straight line of default edges and completes when every step succeeds', async () => {
      mockWorkflowsService.findOne.mockResolvedValueOnce({
        id: workflowId,
        name: 'Pipeline',
        entryStepId: 'step-1',
      });
      mockWorkflowsService.listSteps.mockResolvedValueOnce([
        { id: 'step-1', type: 'agent', config: {} },
        { id: 'step-2', type: 'tool', config: {} },
        { id: 'step-3', type: 'condition', config: {} },
      ]);
      mockWorkflowsService.listEdges.mockResolvedValueOnce([
        {
          id: 'e1',
          fromStepId: 'step-1',
          toStepId: 'step-2',
          branch: 'default',
        },
        {
          id: 'e2',
          fromStepId: 'step-2',
          toStepId: 'step-3',
          branch: 'default',
        },
      ]);
      mockDb.returning
        .mockResolvedValueOnce([runRow])
        .mockResolvedValueOnce([{ ...runRow, status: 'completed' }]);

      const result = await service.execute(workflowId, organizationId, userId, {
        text: 'hi',
      });

      expect(agentExecutor.execute).toHaveBeenCalledWith(
        {},
        { text: 'hi' },
        { organizationId, userId },
      );
      expect(toolExecutor.execute).toHaveBeenCalledWith(
        {},
        { content: 'summary' },
        { organizationId, userId },
      );
      expect(conditionExecutor.execute).toHaveBeenCalledWith(
        {},
        { ok: true, status: 200, body: {} },
        { organizationId, userId },
      );

      const [setArg] = mockDb.set.mock.calls[0] as [{ status: string }];
      expect(setArg.status).toBe('completed');
      expect(result.status).toBe('completed');
      expect(statusFor('step-1')).toBe('success');
      expect(statusFor('step-2')).toBe('success');
      expect(statusFor('step-3')).toBe('success');
    });

    it('routes to the outgoing edge matching the condition output branch, skipping the other branches', async () => {
      conditionExecutor.execute.mockResolvedValueOnce({
        output: { branch: 'b', matched: true },
      });
      mockWorkflowsService.findOne.mockResolvedValueOnce({
        id: workflowId,
        name: 'Router',
        entryStepId: 'cond',
      });
      mockWorkflowsService.listSteps.mockResolvedValueOnce([
        { id: 'cond', type: 'condition', config: {} },
        { id: 'branch-a', type: 'tool', config: { label: 'a' } },
        { id: 'branch-b', type: 'tool', config: { label: 'b' } },
        { id: 'branch-c', type: 'tool', config: { label: 'c' } },
      ]);
      mockWorkflowsService.listEdges.mockResolvedValueOnce([
        { id: 'e1', fromStepId: 'cond', toStepId: 'branch-a', branch: 'a' },
        { id: 'e2', fromStepId: 'cond', toStepId: 'branch-b', branch: 'b' },
        { id: 'e3', fromStepId: 'cond', toStepId: 'branch-c', branch: 'c' },
      ]);
      mockDb.returning
        .mockResolvedValueOnce([runRow])
        .mockResolvedValueOnce([{ ...runRow, status: 'completed' }]);

      await service.execute(workflowId, organizationId, userId);

      expect(statusFor('cond')).toBe('success');
      expect(statusFor('branch-b')).toBe('success');
      expect(statusFor('branch-a')).toBe('skipped');
      expect(statusFor('branch-c')).toBe('skipped');
      expect(toolExecutor.execute).toHaveBeenCalledTimes(1);
      expect(toolExecutor.execute).toHaveBeenCalledWith(
        { label: 'b' },
        { branch: 'b', matched: true },
        { organizationId, userId },
      );
    });

    it('reaches a shared downstream step regardless of which branch was taken (rejoin)', async () => {
      conditionExecutor.execute.mockResolvedValueOnce({
        output: { branch: 'a', matched: true },
      });
      mockWorkflowsService.findOne.mockResolvedValueOnce({
        id: workflowId,
        name: 'Rejoin',
        entryStepId: 'cond',
      });
      mockWorkflowsService.listSteps.mockResolvedValueOnce([
        { id: 'cond', type: 'condition', config: {} },
        { id: 'branch-a', type: 'tool', config: {} },
        { id: 'branch-b', type: 'tool', config: {} },
        { id: 'final', type: 'agent', config: {} },
      ]);
      mockWorkflowsService.listEdges.mockResolvedValueOnce([
        { id: 'e1', fromStepId: 'cond', toStepId: 'branch-a', branch: 'a' },
        { id: 'e2', fromStepId: 'cond', toStepId: 'branch-b', branch: 'b' },
        // Both branches converge on the same downstream step.
        {
          id: 'e3',
          fromStepId: 'branch-a',
          toStepId: 'final',
          branch: 'default',
        },
        {
          id: 'e4',
          fromStepId: 'branch-b',
          toStepId: 'final',
          branch: 'default',
        },
      ]);
      mockDb.returning
        .mockResolvedValueOnce([runRow])
        .mockResolvedValueOnce([{ ...runRow, status: 'completed' }]);

      const result = await service.execute(workflowId, organizationId, userId);

      expect(statusFor('branch-a')).toBe('success');
      expect(statusFor('branch-b')).toBe('skipped');
      expect(statusFor('final')).toBe('success');
      expect(agentExecutor.execute).toHaveBeenCalledWith(
        {},
        { ok: true, status: 200, body: {} },
        { organizationId, userId },
      );
      expect(result.status).toBe('completed');
    });

    it('marks the run failed and skips remaining steps when a step throws', async () => {
      toolExecutor.execute.mockRejectedValueOnce(new Error('tool blew up'));
      mockWorkflowsService.findOne.mockResolvedValueOnce({
        id: workflowId,
        name: 'Pipeline',
        entryStepId: 'step-1',
      });
      mockWorkflowsService.listSteps.mockResolvedValueOnce([
        { id: 'step-1', type: 'agent', config: {} },
        { id: 'step-2', type: 'tool', config: {} },
        { id: 'step-3', type: 'condition', config: {} },
      ]);
      mockWorkflowsService.listEdges.mockResolvedValueOnce([
        {
          id: 'e1',
          fromStepId: 'step-1',
          toStepId: 'step-2',
          branch: 'default',
        },
        {
          id: 'e2',
          fromStepId: 'step-2',
          toStepId: 'step-3',
          branch: 'default',
        },
      ]);
      mockDb.returning
        .mockResolvedValueOnce([runRow])
        .mockResolvedValueOnce([{ ...runRow, status: 'failed' }]);

      await service.execute(workflowId, organizationId, userId);

      expect(conditionExecutor.execute).not.toHaveBeenCalled();

      const [setArg] = mockDb.set.mock.calls[0] as [
        { status: string; error?: string },
      ];
      expect(setArg.status).toBe('failed');
      expect(setArg.error).toBe('tool blew up');
      expect(statusFor('step-1')).toBe('success');
      expect(statusFor('step-2')).toBe('failed');
      expect(statusFor('step-3')).toBe('skipped');
    });

    it('ends the path normally (run completed) when a non-terminal step has no outgoing edge configured', async () => {
      mockWorkflowsService.findOne.mockResolvedValueOnce({
        id: workflowId,
        name: 'Dead end',
        entryStepId: 'step-1',
      });
      mockWorkflowsService.listSteps.mockResolvedValueOnce([
        { id: 'step-1', type: 'agent', config: {} },
        { id: 'step-2', type: 'tool', config: {} },
      ]);
      // No edges at all -- step-1 has nowhere to go.
      mockDb.returning
        .mockResolvedValueOnce([runRow])
        .mockResolvedValueOnce([{ ...runRow, status: 'completed' }]);

      await service.execute(workflowId, organizationId, userId);

      expect(toolExecutor.execute).not.toHaveBeenCalled();
      expect(statusFor('step-1')).toBe('success');
      expect(statusFor('step-2')).toBe('skipped');

      const [setArg] = mockDb.set.mock.calls[0] as [{ status: string }];
      expect(setArg.status).toBe('completed');
    });
  });

  describe('listRuns', () => {
    it('throws NotFoundException when the workflow does not exist', async () => {
      mockWorkflowsService.findOne.mockResolvedValueOnce(null);

      await expect(
        service.listRuns(workflowId, organizationId),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns runs ordered by startedAt', async () => {
      mockWorkflowsService.findOne.mockResolvedValueOnce({ id: workflowId });
      mockDb.orderBy.mockResolvedValueOnce([runRow]);

      const result = await service.listRuns(workflowId, organizationId);

      expect(result).toEqual([runRow]);
    });
  });

  describe('getRun', () => {
    it('returns null when the run does not exist under this workflow', async () => {
      mockWorkflowsService.findOne.mockResolvedValueOnce({ id: workflowId });
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.getRun(
        workflowId,
        'missing-run',
        organizationId,
      );

      expect(result).toBeNull();
    });

    it('returns the run with its ordered step runs', async () => {
      mockWorkflowsService.findOne.mockResolvedValueOnce({ id: workflowId });
      mockDb.limit.mockResolvedValueOnce([runRow]);
      const stepRun = { id: 'sr-1', workflowRunId: 'run-1', status: 'success' };
      mockDb.orderBy.mockResolvedValueOnce([stepRun]);

      const result = await service.getRun(workflowId, 'run-1', organizationId);

      expect(result).toEqual({ ...runRow, stepRuns: [stepRun] });
    });
  });
});
