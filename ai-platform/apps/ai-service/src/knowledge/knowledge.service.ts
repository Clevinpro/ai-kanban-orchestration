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
