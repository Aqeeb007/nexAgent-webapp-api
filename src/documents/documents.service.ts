import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import pdfParse from 'pdf-parse';

import { type Database, DATABASE } from '../database/database.module';
import { documents } from '../database/schema/documents';
import { documentChunks } from '../database/schema/document-chunks';

import { OpenAiService } from '../openai/openai.service';

import { chunkText } from './chunk-text';
import { MAX_EXTRACTED_CHARS } from './upload-limits';

const DOCUMENT_COLUMNS = {
  id: documents.id,
  organizationId: documents.organizationId,
  name: documents.name,
  status: documents.status,
  error: documents.error,
  chunkCount: documents.chunkCount,
  createdAt: documents.createdAt,
  updatedAt: documents.updatedAt,
};

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    private readonly openAiService: OpenAiService,
  ) {}

  // Synchronous end to end (no queue, by design — see docs/ROADMAP.md Phase
  // 5): the row is inserted as `processing` immediately, then parsed,
  // chunked, and embedded before this resolves. A failure at any point
  // after the insert is caught and turns into `status: 'failed'` on the
  // same row rather than an HTTP error — the row always exists and its
  // status tells the caller what happened.
  async create(organizationId: string, name: string, fileBuffer: Buffer) {
    const [document] = await this.db
      .insert(documents)
      .values({ organizationId, name, status: 'processing' })
      .returning(DOCUMENT_COLUMNS);

    try {
      const parsed = await pdfParse(fileBuffer);
      const text = parsed.text.slice(0, MAX_EXTRACTED_CHARS);
      const chunks = chunkText(text);

      if (chunks.length === 0) {
        throw new Error('No extractable text found in this PDF');
      }

      const embeddings = await this.openAiService.createEmbeddings(chunks);

      const [ready] = await this.db.transaction(async (tx) => {
        await tx.insert(documentChunks).values(
          chunks.map((content, index) => ({
            documentId: document.id,
            chunkIndex: index,
            content,
            embedding: embeddings[index],
          })),
        );

        return tx
          .update(documents)
          .set({
            status: 'ready',
            chunkCount: chunks.length,
            updatedAt: new Date(),
          })
          .where(eq(documents.id, document.id))
          .returning(DOCUMENT_COLUMNS);
      });

      return ready;
    } catch (error) {
      this.logger.warn(
        `Document ${document.id} processing failed: ${
          error instanceof Error ? error.message : error
        }`,
      );

      const [failed] = await this.db
        .update(documents)
        .set({
          status: 'failed',
          error:
            error instanceof Error
              ? error.message
              : 'Failed to process document',
          updatedAt: new Date(),
        })
        .where(eq(documents.id, document.id))
        .returning(DOCUMENT_COLUMNS);

      return failed;
    }
  }

  async findAllForOrganization(organizationId: string) {
    return this.db
      .select(DOCUMENT_COLUMNS)
      .from(documents)
      .where(eq(documents.organizationId, organizationId));
  }

  async findOne(id: string, organizationId: string) {
    const result = await this.db
      .select(DOCUMENT_COLUMNS)
      .from(documents)
      .where(
        and(eq(documents.id, id), eq(documents.organizationId, organizationId)),
      )
      .limit(1);

    return result[0] ?? null;
  }

  async remove(id: string, organizationId: string) {
    const result = await this.db
      .delete(documents)
      .where(
        and(eq(documents.id, id), eq(documents.organizationId, organizationId)),
      )
      .returning({ id: documents.id });

    return result[0] ?? null;
  }
}
