import { PrismaService } from '@ai-platform/database';
import { LoggerService, type ChatMessage } from '@ai-platform/shared';
import { Injectable, NotFoundException } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { AiProviderFactory } from '../ai/providers/ai-provider.factory';

@Injectable()
export class KnowledgeService {
  constructor(
    private readonly prismaService: PrismaService,
    private readonly factory: AiProviderFactory,
    private readonly logger: LoggerService,
  ) {}

  async generateDocNotes(documentId: string): Promise<void> {
    const document = await this.prismaService.document.findUnique({
      where: { id: documentId },
      select: { id: true, title: true, content: true },
    });

    if (!document) {
      throw new NotFoundException(`Document with id "${documentId}" was not found.`);
    }

    this.logger.log(
      `Generating documentation notes: documentId=${document.id}`,
      'KnowledgeService',
    );

    const provider = this.factory.getProvider();
    const notes = await this.collectResponse(
      provider.chat(this.buildDocNotesPrompt(document.title, document.content)),
    );

    await this.prismaService.document.update({
      where: { id: document.id },
      data: { notes: notes.trim() },
    });

    this.logger.log(`Documentation notes generated: documentId=${document.id}`, 'KnowledgeService');
  }

  async refreshGuideSummary(newDocumentId: string): Promise<void> {
    const guide = await this.prismaService.document.findFirst({
      where: { type: 'GUIDE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, content: true, summary: true },
    });

    if (!guide) {
      this.logger.warn(
        'Guide document was not found; skipping guide summary refresh',
        'KnowledgeService',
      );
      return;
    }

    const newDocument = await this.prismaService.document.findUnique({
      where: { id: newDocumentId },
      select: { id: true, title: true, content: true },
    });

    if (!newDocument) {
      throw new NotFoundException(`Document with id "${newDocumentId}" was not found.`);
    }

    this.logger.log(
      `Refreshing guide summary: guideId=${guide.id}, newDocumentId=${newDocument.id}`,
      'KnowledgeService',
    );

    const currentSummary = guide.summary?.trim() || guide.content;
    const provider = this.factory.getProvider();
    const summary = await this.collectResponse(
      provider.chat(
        this.buildGuideSummaryPrompt(currentSummary, newDocument.title, newDocument.content),
      ),
    );

    await this.prismaService.document.update({
      where: { id: guide.id },
      data: { summary: summary.trim() },
    });

    this.logger.log(`Guide summary refreshed: guideId=${guide.id}`, 'KnowledgeService');
  }

  private buildDocNotesPrompt(title: string, content: string): ChatMessage[] {
    return [
      {
        role: 'user',
        content: `You are a knowledge base assistant.
Read the following documentation and write brief notes (3-5 bullet points) 
about what this document covers. Be concise and factual.
Document title: ${title}
Content: ${content}
Return only the bullet points, no intro text.`,
      },
    ];
  }

  private buildGuideSummaryPrompt(
    currentSummary: string,
    newDocumentTitle: string,
    newDocumentContent: string,
  ): ChatMessage[] {
    return [
      {
        role: 'user',
        content: `You are a knowledge base assistant maintaining an application guide.
Current application guide summary:
${currentSummary}
A new documentation file has been added:
Title: ${newDocumentTitle}
Content: ${newDocumentContent}
Update the application guide summary to include any new capabilities or topics 
from the new documentation. Keep it concise (max 10 sentences). 
Write in present tense. Focus on what users CAN DO.`,
      },
    ];
  }

  private collectResponse(stream: Observable<string>): Promise<string> {
    return new Promise((resolve, reject) => {
      let result = '';

      stream.subscribe({
        next: (chunk) => {
          result += chunk;
        },
        complete: () => resolve(result),
        error: reject,
      });
    });
  }
}
