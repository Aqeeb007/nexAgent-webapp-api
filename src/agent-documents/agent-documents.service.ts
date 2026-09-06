import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, cosineDistance, eq } from 'drizzle-orm';

import { type Database, DATABASE } from '../database/database.module';
import { agentDocuments } from '../database/schema/agent-documents';
import { documents } from '../database/schema/documents';
import { documentChunks } from '../database/schema/document-chunks';

import { AgentsService } from '../agents/agents.service';
import { DocumentsService } from '../documents/documents.service';

import { isUniqueConstraintViolation } from '../common/utils/postgres-error.util';

@Injectable()
export class AgentDocumentsService {
  constructor(
    @Inject(DATABASE)
    private readonly db: Database,
    private readonly agentsService: AgentsService,
    private readonly documentsService: DocumentsService,
  ) {}

  async attach(agentId: string, documentId: string, organizationId: string) {
    const agent = await this.agentsService.findOne(agentId, organizationId);

    if (!agent) {
      throw new NotFoundException('Agent not found');
    }

    const document = await this.documentsService.findOne(
      documentId,
      organizationId,
    );

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    try {
      const [attachment] = await this.db
        .insert(agentDocuments)
        .values({
          organizationId,
          agentId,
          documentId,
        })
        .returning({
          id: agentDocuments.id,
          agentId: agentDocuments.agentId,
          documentId: agentDocuments.documentId,
          createdAt: agentDocuments.createdAt,
        });

      return attachment;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException(
          'Document is already attached to this agent',
        );
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
        id: documents.id,
        name: documents.name,
        status: documents.status,
        attachedAt: agentDocuments.createdAt,
      })
      .from(agentDocuments)
      .innerJoin(documents, eq(agentDocuments.documentId, documents.id))
      .where(
        and(
          eq(agentDocuments.agentId, agentId),
          eq(agentDocuments.organizationId, organizationId),
        ),
      );
  }

  async detach(agentId: string, documentId: string, organizationId: string) {
    const result = await this.db
      .delete(agentDocuments)
      .where(
        and(
          eq(agentDocuments.agentId, agentId),
          eq(agentDocuments.documentId, documentId),
          eq(agentDocuments.organizationId, organizationId),
        ),
      )
      .returning({ id: agentDocuments.id });

    return result[0] ?? null;
  }

  // RAG retrieval — joins agent_documents -> documents -> document_chunks,
  // restricted to this agent/org and to fully-processed documents, ordered
  // by vector distance (closest first). Internal use only (ChatService);
  // rides on the caller's existing AGENT_READ, not a separate permission —
  // see docs/ROADMAP.md's Phase 5 note on why this isn't gated like
  // TOOL_EXECUTE.
  async searchRelevant(
    agentId: string,
    organizationId: string,
    embedding: number[],
    topK = 5,
  ) {
    const distance = cosineDistance(documentChunks.embedding, embedding);

    return this.db
      .select({
        content: documentChunks.content,
        documentName: documents.name,
      })
      .from(agentDocuments)
      .innerJoin(documents, eq(agentDocuments.documentId, documents.id))
      .innerJoin(
        documentChunks,
        eq(documentChunks.documentId, documents.id),
      )
      .where(
        and(
          eq(agentDocuments.agentId, agentId),
          eq(agentDocuments.organizationId, organizationId),
          eq(documents.status, 'ready'),
        ),
      )
      .orderBy(asc(distance))
      .limit(topK);
  }
}
