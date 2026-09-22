import { Test, TestingModule } from '@nestjs/testing';

import { DocumentsService } from './documents.service';
import { DATABASE } from '../database/database.module';
import { OpenAiService } from '../openai/openai.service';
import { UsageService } from '../usage/usage.service';
import { USAGE_EVENT_TYPES } from '../usage/constants/usage-event-types';

jest.mock('pdf-parse', () => jest.fn());
import pdfParse from 'pdf-parse';

describe('DocumentsService', () => {
  let service: DocumentsService;
  let mockDb: {
    insert: jest.Mock;
    values: jest.Mock;
    select: jest.Mock;
    from: jest.Mock;
    where: jest.Mock;
    limit: jest.Mock;
    update: jest.Mock;
    set: jest.Mock;
    delete: jest.Mock;
    returning: jest.Mock;
    transaction: jest.Mock;
  };
  let mockOpenAiService: { createEmbeddings: jest.Mock };
  let mockUsageService: { record: jest.Mock };

  const organizationId = 'org-1';
  const processingDocument = {
    id: 'doc-1',
    organizationId,
    name: 'file.pdf',
    status: 'processing',
    error: null,
    chunkCount: 0,
  };

  beforeEach(async () => {
    mockDb = {
      insert: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      delete: jest.fn().mockReturnThis(),
      returning: jest.fn(),
      transaction: jest.fn(),
    };
    mockDb.transaction.mockImplementation(
      async (callback: (tx: typeof mockDb) => unknown) => callback(mockDb),
    );

    mockOpenAiService = { createEmbeddings: jest.fn() };
    mockUsageService = { record: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: DATABASE, useValue: mockDb },
        { provide: OpenAiService, useValue: mockOpenAiService },
        { provide: UsageService, useValue: mockUsageService },
      ],
    }).compile();

    service = module.get<DocumentsService>(DocumentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('parses, chunks, embeds, and marks the document ready in one transaction', async () => {
      mockDb.returning
        .mockResolvedValueOnce([processingDocument])
        .mockResolvedValueOnce([
          { ...processingDocument, status: 'ready', chunkCount: 1 },
        ]);
      (pdfParse as unknown as jest.Mock).mockResolvedValueOnce({
        text: 'hello world',
      });
      mockOpenAiService.createEmbeddings.mockResolvedValueOnce({
        embeddings: [[0.1, 0.2, 0.3]],
        totalTokens: 3,
      });

      const result = await service.create(
        organizationId,
        'file.pdf',
        Buffer.from('%PDF-1.4'),
      );

      expect(mockOpenAiService.createEmbeddings).toHaveBeenCalledWith([
        'hello world',
      ]);
      expect(mockDb.transaction).toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'ready', chunkCount: 1 });
      expect(mockUsageService.record).toHaveBeenCalledWith(
        organizationId,
        USAGE_EVENT_TYPES.EMBEDDING,
        3,
        expect.objectContaining({ source: 'document_upload' }),
      );
    });

    it('marks the document failed instead of throwing when parsing yields no text', async () => {
      mockDb.returning
        .mockResolvedValueOnce([processingDocument])
        .mockResolvedValueOnce([
          {
            ...processingDocument,
            status: 'failed',
            error: 'No extractable text found in this PDF',
          },
        ]);
      (pdfParse as unknown as jest.Mock).mockResolvedValueOnce({ text: '  ' });

      const result = await service.create(
        organizationId,
        'file.pdf',
        Buffer.from('%PDF-1.4'),
      );

      expect(mockOpenAiService.createEmbeddings).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'failed' });
    });

    it('marks the document failed when the embeddings call throws', async () => {
      mockDb.returning
        .mockResolvedValueOnce([processingDocument])
        .mockResolvedValueOnce([
          { ...processingDocument, status: 'failed', error: 'rate limited' },
        ]);
      (pdfParse as unknown as jest.Mock).mockResolvedValueOnce({
        text: 'hello world',
      });
      mockOpenAiService.createEmbeddings.mockRejectedValueOnce(
        new Error('rate limited'),
      );

      const result = await service.create(
        organizationId,
        'file.pdf',
        Buffer.from('%PDF-1.4'),
      );

      expect(result).toMatchObject({ status: 'failed' });
    });
  });

  describe('findOne', () => {
    it('returns the row scoped to id and organization', async () => {
      mockDb.limit.mockResolvedValueOnce([processingDocument]);

      const result = await service.findOne('doc-1', organizationId);

      expect(result).toEqual(processingDocument);
    });

    it('returns null when nothing matches', async () => {
      mockDb.limit.mockResolvedValueOnce([]);

      const result = await service.findOne('doc-1', organizationId);

      expect(result).toBeNull();
    });
  });

  describe('remove', () => {
    it('returns the deleted id when found', async () => {
      mockDb.returning.mockResolvedValueOnce([{ id: 'doc-1' }]);

      const result = await service.remove('doc-1', organizationId);

      expect(result).toEqual({ id: 'doc-1' });
    });

    it('returns null when nothing was deleted', async () => {
      mockDb.returning.mockResolvedValueOnce([]);

      const result = await service.remove('doc-1', organizationId);

      expect(result).toBeNull();
    });
  });
});
