import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';

import { AgentDocumentsService } from './agent-documents.service';
import { AgentsService } from '../agents/agents.service';
import { DocumentsService } from '../documents/documents.service';
import { DATABASE } from '../database/database.module';

describe('AgentDocumentsService', () => {
  let service: AgentDocumentsService;
  let mockDb: {
    select: jest.Mock;
    from: jest.Mock;
    innerJoin: jest.Mock;
    where: jest.Mock;
    orderBy: jest.Mock;
    limit: jest.Mock;
    insert: jest.Mock;
    values: jest.Mock;
    delete: jest.Mock;
    returning: jest.Mock;
  };
  let mockAgentsService: { findOne: jest.Mock };
  let mockDocumentsService: { findOne: jest.Mock };

  const organizationId = 'org-1';
  const agent = { id: 'agent-1', organizationId };
  const document = { id: 'doc-1', organizationId };

  beforeEach(async () => {
    mockDb = {
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn(),
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      returning: jest.fn(),
    };
    mockAgentsService = { findOne: jest.fn() };
    mockDocumentsService = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AgentDocumentsService,
        { provide: DATABASE, useValue: mockDb },
        { provide: AgentsService, useValue: mockAgentsService },
        { provide: DocumentsService, useValue: mockDocumentsService },
      ],
    }).compile();

    service = module.get<AgentDocumentsService>(AgentDocumentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('attach', () => {
    it('inserts and returns the attachment when both agent and document are in the org', async () => {
      mockAgentsService.findOne.mockResolvedValueOnce(agent);
      mockDocumentsService.findOne.mockResolvedValueOnce(document);
      const attachment = {
        id: 'ad-1',
        agentId: 'agent-1',
        documentId: 'doc-1',
      };
      mockDb.returning.mockResolvedValueOnce([attachment]);

      const result = await service.attach(
        'agent-1',
        'doc-1',
        organizationId,
      );

      expect(mockDb.insert).toHaveBeenCalled();
      expect(result).toEqual(attachment);
    });

    it('throws NotFoundException when the agent is not in the org', async () => {
      mockAgentsService.findOne.mockResolvedValueOnce(null);

      await expect(
        service.attach('agent-1', 'doc-1', organizationId),
      ).rejects.toThrow(NotFoundException);
      expect(mockDocumentsService.findOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the document is not in the org', async () => {
      mockAgentsService.findOne.mockResolvedValueOnce(agent);
      mockDocumentsService.findOne.mockResolvedValueOnce(null);

      await expect(
        service.attach('agent-1', 'doc-1', organizationId),
      ).rejects.toThrow(NotFoundException);
      expect(mockDb.insert).not.toHaveBeenCalled();
    });

    it('throws ConflictException when the document is already attached', async () => {
      mockAgentsService.findOne.mockResolvedValueOnce(agent);
      mockDocumentsService.findOne.mockResolvedValueOnce(document);
      mockDb.returning.mockRejectedValueOnce({ code: '23505' });

      await expect(
        service.attach('agent-1', 'doc-1', organizationId),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('detach', () => {
    it('deletes and returns the id when the attachment exists', async () => {
      mockDb.returning.mockResolvedValueOnce([{ id: 'ad-1' }]);

      const result = await service.detach(
        'agent-1',
        'doc-1',
        organizationId,
      );

      expect(mockDb.delete).toHaveBeenCalled();
      expect(result).toEqual({ id: 'ad-1' });
    });

    it('returns null when the attachment does not exist', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const result = await service.detach(
        'agent-1',
        'doc-1',
        organizationId,
      );

      expect(result).toBeNull();
    });
  });

  describe('searchRelevant', () => {
    it('joins agent_documents -> documents -> document_chunks and orders by vector distance', async () => {
      const chunks = [{ content: 'relevant text', documentName: 'a.pdf' }];
      mockDb.limit.mockResolvedValueOnce(chunks);

      const result = await service.searchRelevant(
        'agent-1',
        organizationId,
        [0.1, 0.2, 0.3],
        5,
      );

      expect(mockDb.innerJoin).toHaveBeenCalledTimes(2);
      expect(mockDb.orderBy).toHaveBeenCalled();
      expect(mockDb.limit).toHaveBeenCalledWith(5);
      expect(result).toEqual(chunks);
    });

    it('defaults topK to 5', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      await service.searchRelevant('agent-1', organizationId, [0.1]);

      expect(mockDb.limit).toHaveBeenCalledWith(5);
    });
  });
});
