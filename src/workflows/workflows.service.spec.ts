import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { DATABASE } from '../database/database.module';
import { Test, TestingModule } from '@nestjs/testing';

describe('WorkflowsService', () => {
  let service: WorkflowsService;
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

  const organizationId = 'org-1';
  const workflowId = 'workflow-1';
  const workflowRow = {
    id: workflowId,
    organizationId,
    name: 'Onboarding',
    description: null,
    entryStepId: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };
  const stepRow = {
    id: 'step-1',
    workflowId,
    stepOrder: 0,
    type: 'agent',
    config: { agentId: 'agent-1' },
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

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

    const module: TestingModule = await Test.createTestingModule({
      providers: [WorkflowsService, { provide: DATABASE, useValue: mockDb }],
    }).compile();

    service = module.get<WorkflowsService>(WorkflowsService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('inserts and returns the new workflow', async () => {
      mockDb.returning.mockResolvedValueOnce([workflowRow]);

      const result = await service.create(organizationId, {
        name: 'Onboarding',
      });

      expect(mockDb.insert).toHaveBeenCalled();
      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId, name: 'Onboarding' }),
      );
      expect(result).toEqual(workflowRow);
    });
  });

  describe('findOne', () => {
    it('returns the workflow when it exists in the given organization', async () => {
      mockDb.limit.mockResolvedValueOnce([workflowRow]);

      const result = await service.findOne(workflowId, organizationId);

      expect(result).toEqual(workflowRow);
    });

    it('returns null when not found', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.findOne(workflowId, 'other-org');

      expect(result).toBeNull();
    });
  });

  describe('update', () => {
    it('updates and returns the workflow', async () => {
      const updated = { ...workflowRow, name: 'Renamed' };
      mockDb.returning.mockResolvedValueOnce([updated]);

      const result = await service.update(workflowId, organizationId, {
        name: 'Renamed',
      });

      expect(result).toEqual(updated);
    });

    it('validates the entry step belongs to this workflow before updating', async () => {
      mockDb.limit
        .mockResolvedValueOnce([workflowRow]) // getStep -> findOne
        .mockResolvedValueOnce([stepRow]); // getStep -> step lookup
      mockDb.returning.mockResolvedValueOnce([
        { ...workflowRow, entryStepId: stepRow.id },
      ]);

      const result = await service.update(workflowId, organizationId, {
        entryStepId: stepRow.id,
      });

      expect(result.entryStepId).toBe(stepRow.id);
    });

    it('throws NotFoundException when entryStepId does not belong to this workflow', async () => {
      mockDb.limit
        .mockResolvedValueOnce([workflowRow]) // getStep -> findOne
        .mockResolvedValueOnce([]); // getStep -> step lookup, not found

      await expect(
        service.update(workflowId, organizationId, {
          entryStepId: 'missing-step',
        }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('deletes and returns the id when found', async () => {
      mockDb.returning.mockResolvedValueOnce([{ id: workflowId }]);

      const result = await service.remove(workflowId, organizationId);

      expect(result).toEqual({ id: workflowId });
    });
  });

  describe('addStep', () => {
    it('throws NotFoundException when the workflow does not exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.addStep(workflowId, organizationId, {
          type: 'agent',
          config: {},
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('inserts at the explicit stepOrder when one is given, skipping auto-assignment', async () => {
      mockDb.limit.mockResolvedValueOnce([workflowRow]); // findOne
      mockDb.returning.mockResolvedValueOnce([{ ...stepRow, stepOrder: 5 }]);

      const result = await service.addStep(workflowId, organizationId, {
        type: 'agent',
        config: { agentId: 'agent-1' },
        stepOrder: 5,
      });

      expect(mockDb.values).toHaveBeenCalledWith(
        expect.objectContaining({ stepOrder: 5, workflowId }),
      );
      expect(result.stepOrder).toBe(5);
    });

    it('auto-sets the workflow entry step when this is the first step added', async () => {
      mockDb.limit.mockResolvedValueOnce([workflowRow]); // findOne, entryStepId: null
      mockDb.returning.mockResolvedValueOnce([stepRow]);

      await service.addStep(workflowId, organizationId, {
        type: 'agent',
        config: {},
        stepOrder: 0,
      });

      expect(mockDb.update).toHaveBeenCalled();
      expect(mockDb.set).toHaveBeenCalledWith({ entryStepId: stepRow.id });
    });

    it('does not touch the entry step when the workflow already has one', async () => {
      mockDb.limit.mockResolvedValueOnce([
        { ...workflowRow, entryStepId: 'existing-step' },
      ]);
      mockDb.returning.mockResolvedValueOnce([
        { ...stepRow, id: 'step-2', stepOrder: 1 },
      ]);

      await service.addStep(workflowId, organizationId, {
        type: 'tool',
        config: {},
        stepOrder: 1,
      });

      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });

  describe('nextStepOrder (private)', () => {
    interface HasNextStepOrder {
      nextStepOrder(workflowId: string): Promise<number>;
    }

    it('returns 0 for the first step in a workflow', async () => {
      mockDb.where.mockResolvedValueOnce([{ max: null }]);

      const next = await (service as unknown as HasNextStepOrder).nextStepOrder(
        workflowId,
      );

      expect(next).toBe(0);
    });

    it('returns max + 1 when steps already exist', async () => {
      mockDb.where.mockResolvedValueOnce([{ max: 3 }]);

      const next = await (service as unknown as HasNextStepOrder).nextStepOrder(
        workflowId,
      );

      expect(next).toBe(4);
    });
  });

  describe('listSteps', () => {
    it('throws NotFoundException when the workflow does not exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.listSteps(workflowId, organizationId),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns steps ordered by stepOrder', async () => {
      mockDb.limit.mockResolvedValueOnce([workflowRow]); // findOne
      mockDb.orderBy.mockResolvedValueOnce([stepRow]);

      const result = await service.listSteps(workflowId, organizationId);

      expect(result).toEqual([stepRow]);
    });
  });

  describe('getStep', () => {
    it('returns the step scoped to the workflow', async () => {
      mockDb.limit
        .mockResolvedValueOnce([workflowRow]) // findOne
        .mockResolvedValueOnce([stepRow]); // step lookup

      const result = await service.getStep(
        workflowId,
        'step-1',
        organizationId,
      );

      expect(result).toEqual(stepRow);
    });

    it('returns null when the step does not exist under this workflow', async () => {
      mockDb.limit
        .mockResolvedValueOnce([workflowRow])
        .mockResolvedValueOnce([]);

      const result = await service.getStep(
        workflowId,
        'missing-step',
        organizationId,
      );

      expect(result).toBeNull();
    });
  });

  describe('updateStep', () => {
    it('updates and returns the step', async () => {
      mockDb.limit.mockResolvedValueOnce([workflowRow]); // findOne
      const updated = { ...stepRow, config: { agentId: 'agent-2' } };
      mockDb.returning.mockResolvedValueOnce([updated]);

      const result = await service.updateStep(
        workflowId,
        'step-1',
        organizationId,
        {
          config: { agentId: 'agent-2' },
        },
      );

      expect(result).toEqual(updated);
    });
  });

  describe('removeStep', () => {
    it('deletes and returns the id when found', async () => {
      mockDb.limit.mockResolvedValueOnce([workflowRow]); // findOne
      mockDb.returning.mockResolvedValueOnce([{ id: 'step-1' }]);

      const result = await service.removeStep(
        workflowId,
        'step-1',
        organizationId,
      );

      expect(result).toEqual({ id: 'step-1' });
    });
  });

  describe('addEdge', () => {
    const fromStep = { ...stepRow, id: 'from-step' };
    const toStep = { ...stepRow, id: 'to-step' };

    // findOne/getStep are already covered by their own describe blocks
    // above — addEdge's tests stub them directly so they focus on addEdge's
    // own logic (self-loop rejection, cycle detection, uniqueness mapping)
    // without depending on the exact interleaving of the two concurrent
    // getStep() calls' underlying db chains.
    beforeEach(() => {
      jest.spyOn(service, 'findOne').mockResolvedValue(workflowRow);
      jest
        .spyOn(service, 'getStep')
        .mockImplementation(((_wfId: string, stepId: string) =>
          Promise.resolve(
            stepId === fromStep.id
              ? fromStep
              : stepId === toStep.id
                ? toStep
                : null,
          )) as WorkflowsService['getStep']);
    });

    it('throws NotFoundException when the workflow does not exist', async () => {
      jest
        .spyOn(service, 'findOne')
        .mockResolvedValueOnce(
          null as unknown as Awaited<ReturnType<WorkflowsService['findOne']>>,
        );

      await expect(
        service.addEdge(workflowId, organizationId, {
          fromStepId: fromStep.id,
          toStepId: toStep.id,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an edge pointing a step at itself', async () => {
      await expect(
        service.addEdge(workflowId, organizationId, {
          fromStepId: fromStep.id,
          toStepId: fromStep.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when either step does not belong to this workflow', async () => {
      await expect(
        service.addEdge(workflowId, organizationId, {
          fromStepId: fromStep.id,
          toStepId: 'unknown-step',
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects an edge that would create a cycle', async () => {
      // An edge already runs to-step -> from-step; adding from-step ->
      // to-step on top of that would close a 2-cycle.
      mockDb.where.mockResolvedValueOnce([
        { fromStepId: toStep.id, toStepId: fromStep.id },
      ]);

      await expect(
        service.addEdge(workflowId, organizationId, {
          fromStepId: fromStep.id,
          toStepId: toStep.id,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('inserts and returns the edge when everything checks out', async () => {
      mockDb.where.mockResolvedValueOnce([]); // canReach: no existing edges
      const edgeRow = {
        id: 'edge-1',
        workflowId,
        fromStepId: fromStep.id,
        toStepId: toStep.id,
        branch: 'default',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      };
      mockDb.returning.mockResolvedValueOnce([edgeRow]);

      const result = await service.addEdge(workflowId, organizationId, {
        fromStepId: fromStep.id,
        toStepId: toStep.id,
      });

      expect(result).toEqual(edgeRow);
    });

    it('maps a unique-constraint violation to ConflictException', async () => {
      mockDb.where.mockResolvedValueOnce([]); // canReach: no existing edges
      mockDb.returning.mockRejectedValueOnce(
        Object.assign(new Error('duplicate'), { code: '23505' }),
      );

      await expect(
        service.addEdge(workflowId, organizationId, {
          fromStepId: fromStep.id,
          toStepId: toStep.id,
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('listEdges', () => {
    it('throws NotFoundException when the workflow does not exist', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await expect(
        service.listEdges(workflowId, organizationId),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns edges ordered by createdAt', async () => {
      mockDb.limit.mockResolvedValueOnce([workflowRow]); // findOne
      const edgeRow = {
        id: 'edge-1',
        workflowId,
        fromStepId: 'a',
        toStepId: 'b',
        branch: 'default',
        createdAt: new Date('2026-01-01T00:00:00Z'),
      };
      mockDb.orderBy.mockResolvedValueOnce([edgeRow]);

      const result = await service.listEdges(workflowId, organizationId);

      expect(result).toEqual([edgeRow]);
    });
  });

  describe('removeEdge', () => {
    it('deletes and returns the id when found', async () => {
      mockDb.limit.mockResolvedValueOnce([workflowRow]); // findOne
      mockDb.returning.mockResolvedValueOnce([{ id: 'edge-1' }]);

      const result = await service.removeEdge(
        workflowId,
        'edge-1',
        organizationId,
      );

      expect(result).toEqual({ id: 'edge-1' });
    });
  });
});
