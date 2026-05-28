import { AiStatusStage, ChatMessage, LoggerService } from '@ai-platform/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { BehaviorSubject, Observable, from } from 'rxjs';
import { switchMap, tap } from 'rxjs/operators';
import { ConversationService } from '../conversation/conversation.service';
import { SearchService, SimilaritySearchResult } from '../search/search.service';
import { CapabilityDetectorService } from './capability-detector.service';
import { AiProviderFactory } from './providers/ai-provider.factory';

type AiRequestPayload = {
  message: string;
  conversationId?: string;
};

type ProcessMessageOptions = {
  onStatus?: (stage: AiStatusStage, message: string) => void;
};

@Injectable()
export class AiService {
  private static readonly CAPABILITY_VAULT_PREFIX = 'docs/obsidian-vault/project/';

  constructor(
    private readonly searchService: SearchService,
    private readonly factory: AiProviderFactory,
    private readonly conversationService: ConversationService,
    private readonly logger: LoggerService,
    private readonly capabilityDetector: CapabilityDetectorService,
  ) {}

  processMessage(request: unknown, options?: ProcessMessageOptions): Observable<string> {
    const payload = this.parseRequest(request);
    const emitStatus = (stage: AiStatusStage, message: string) =>
      options?.onStatus?.(stage, message);

    emitStatus('init', 'Preparing request...');
    this.logger.log(
      `Process message: conversationId=${payload.conversationId}, length=${payload.message.length}`,
      'AiService',
    );

    return from(this.capabilityDetector.isCapabilityQuery(payload.message)).pipe(
      switchMap((isCapability) => {
        if (isCapability) {
          return from(this.answerCapabilityQuery(payload, emitStatus)).pipe(
            switchMap((obs) => obs),
          );
        }
        return this.runRagFlow(payload, emitStatus);
      }),
    );
  }

  private runRagFlow(
    payload: AiRequestPayload,
    emitStatus: (stage: AiStatusStage, message: string) => void,
  ): Observable<string> {
    const provider = this.factory.getProvider();
    void provider
      .getActiveModel?.()
      .then((model) => {
        this.logger.log(
          `Selected provider=${provider.constructor.name}, model=${model}`,
          'AiService',
        );
      })
      .catch((err: unknown) => {
        this.logger.warn(
          `Cannot resolve active model: ${err instanceof Error ? err.message : String(err)}`,
          'AiService',
        );
      });

    emitStatus('rag_search', 'Searching relevant context...');
    return from(this.searchService.similaritySearch(payload.message)).pipe(
      tap((chunks) => {
        this.logger.log(`Context chunks: count=${chunks.length}`, 'AiService');
        emitStatus(
          'rag_found',
          chunks.length > 0 ? `Found ${chunks.length} context chunks` : 'No relevant context found',
        );
      }),
      switchMap((chunks) =>
        from(this.loadSystemPrompt(chunks)).pipe(
          tap(() => emitStatus('prompt_build', 'Preparing prompt...')),
          switchMap((systemPrompt) =>
            from(
              this.buildAndStream(
                provider,
                payload.message,
                systemPrompt,
                payload.conversationId,
                emitStatus,
              ),
            ).pipe(switchMap((obs) => obs)),
          ),
        ),
      ),
    );
  }

  private async answerCapabilityQuery(
    payload: AiRequestPayload,
    emitStatus: (stage: AiStatusStage, message: string) => void,
  ): Promise<Observable<string>> {
    const provider = this.factory.getProvider();

    emitStatus('rag_search', 'Searching relevant context...');
    const chunks = await this.searchService.similaritySearch(
      payload.message,
      6,
      AiService.CAPABILITY_VAULT_PREFIX,
    );

    this.logger.log(
      `Capability query chunks: count=${chunks.length}, prefix=${AiService.CAPABILITY_VAULT_PREFIX}`,
      'AiService',
    );
    emitStatus(
      'rag_found',
      chunks.length > 0 ? `Found ${chunks.length} context chunks` : 'No relevant context found',
    );

    const systemPrompt = await this.loadSystemPrompt(chunks);
    emitStatus('prompt_build', 'Preparing prompt...');

    return this.buildAndStream(
      provider,
      payload.message,
      systemPrompt,
      payload.conversationId,
      emitStatus,
    );
  }

  private async loadSystemPrompt(chunks: SimilaritySearchResult[]): Promise<string> {
    this.logger.log(`Loading system prompt: chunksCount=${chunks.length}`, 'AiService');
    if (chunks.length === 0) {
      return `You are the platform’s AI assistant. Respond clearly and helpfully. If the question concerns specific platform data or documents, inform the user that the relevant information was not found in the knowledge base.`;
    }
    const contextText = this.searchService.formatContext(chunks);
    return `Context (single source of facts):
      ${contextText}

      Response rules:
      - Use only wording from context above;
      - Respond literally from it, no paraphrasing or extra explanations;
      - Do not add information not in context.
      - Response format: tag number in docs, full text from docs.
      - If context has no answer — state it explicitly.`;
  }

  private async buildAndStream(
    provider: ReturnType<AiProviderFactory['getProvider']>,
    userMessage: string,
    systemPrompt: string | undefined,
    conversationId: string | undefined,
    emitStatus: (stage: AiStatusStage, message: string) => void,
  ): Promise<Observable<string>> {
    const messages: ChatMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (conversationId) {
      emitStatus('history_load', 'Loading conversation history...');
      const history = await this.conversationService.loadHistory(conversationId);
      for (const msg of history) {
        messages.push(msg);
      }
    }

    messages.push({ role: 'user', content: userMessage });

    if (conversationId) {
      emitStatus('save_message', 'Saving user message...');
      await this.conversationService.saveMessage({
        conversationId,
        role: 'user',
        content: userMessage,
      });
    }

    this.logger.log(
      `Sending to LLM: system=${systemPrompt ? 'yes' : 'no'}, history=${messages.length - 1}, userMsgLen=${userMessage.length}`,
      'AiService',
    );

    emitStatus('llm_start', 'Sending request to the model...');
    const stream = provider.chat(messages);

    const subject = new BehaviorSubject<string>('');
    let collected = '';
    let firstChunkReceived = false;

    const subscription = stream.subscribe({
      next: (chunk) => {
        if (!firstChunkReceived) {
          firstChunkReceived = true;
          emitStatus('llm_generating', 'Model is generating a response...');
        }
        collected += chunk;
        subject.next(chunk);
      },
      complete: () => {
        emitStatus('save_response', 'Saving assistant response...');
        void this.persistAssistantMessage(conversationId, collected)
          .then(() => subject.complete())
          .catch((err: unknown) => subject.error(err));
      },
      error: (err) => {
        subject.error(err);
      },
    });

    const result = subject.asObservable().pipe(
      tap({
        unsubscribe: () => subscription.unsubscribe(),
      }),
    );

    return result;
  }

  private async persistAssistantMessage(
    conversationId: string | undefined,
    content: string,
  ): Promise<void> {
    if (!conversationId) return;
    await this.conversationService.saveMessage({
      conversationId,
      role: 'assistant',
      content,
    });
    this.logger.log(
      `Saved assistant message: conversationId=${conversationId}, len=${content.length}`,
      'AiService',
    );
  }

  private parseRequest(request: unknown): AiRequestPayload {
    if (!request || typeof request !== 'object') {
      this.logger.warn('Invalid AI request: not an object', 'AiService');
      throw new BadRequestException('Request message must be a non-empty string.');
    }

    const r = request as Record<string, unknown>;
    const raw =
      typeof r.message === 'string' ? r.message : typeof r.text === 'string' ? r.text : undefined;
    const message = typeof raw === 'string' ? raw.trim() : '';

    if (!message) {
      this.logger.warn('Invalid AI request: missing, empty, or non-string message', 'AiService');
      throw new BadRequestException('Request message must be a non-empty string.');
    }

    return {
      message,
      conversationId: typeof r.conversationId === 'string' ? r.conversationId : undefined,
    };
  }
}
