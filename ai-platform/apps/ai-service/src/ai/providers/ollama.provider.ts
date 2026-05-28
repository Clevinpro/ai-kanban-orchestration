import { AiChatMessage, ChatMessage, IAIProvider, LoggerService } from '@ai-platform/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError } from 'axios';
import { Observable } from 'rxjs';
import { Readable } from 'stream';

@Injectable()
export class OllamaProvider implements IAIProvider {
  private readonly ollamaUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.ollamaUrl = this.configService.get<string>('OLLAMA_URL') ?? 'http://localhost:11434';
  }

  /**
   * Convert messages for Ollama /api/chat.
   * Ollama only supports role=user — system is concatenated as the first user message.
   */
  private static toChatMessages(message: AiChatMessage): Array<{
    role: 'user';
    content: string;
  }> {
    if (typeof message === 'string') {
      return [{ role: 'user', content: message }];
    }
    if (!Array.isArray(message)) {
      const content = `${message.system}\n\n---\n\n${message.user}`;
      return [{ role: 'user', content }];
    }
    // Keep system as a separate user block at the start, rest as individual messages.
    let systemContent: string | undefined;
    const nonSystem = message.filter((m): m is ChatMessage => m.role !== 'system');
    const systemMsg = message.find((m) => m.role === 'system');
    if (systemMsg) {
      systemContent = systemMsg.content;
    }
    if (nonSystem.length === 0) {
      // Only system — treat it as RAG context.
      return [{ role: 'user', content: systemContent ?? '' }];
    }
    if (systemContent) {
      const [first, ...rest] = nonSystem;
      return [
        { role: 'user', content: `${systemContent}\n\n---\n\n${first.content}` },
        ...rest.map((m) => ({ role: 'user' as const, content: m.content })),
      ];
    }
    return nonSystem.map((m) => ({ role: 'user' as const, content: m.content }));
  }

  /**
   * With `responseType: 'stream'`, error bodies may be a Readable (not JSON-serializable; holds socket refs).
   */
  private static async formatAxiosErrorBody(raw: unknown): Promise<string> {
    if (typeof raw === 'string') {
      return raw;
    }
    if (Buffer.isBuffer(raw)) {
      return raw.toString('utf8');
    }
    if (raw instanceof Readable) {
      const chunks: Buffer[] = [];
      for await (const chunk of raw) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      return Buffer.concat(chunks).toString('utf8');
    }
    try {
      return JSON.stringify(raw);
    } catch {
      return String(raw);
    }
  }

  /**
   * Auto-pick must skip embedding-only models (they fail /api/chat).
   * Newer Ollama: `capabilities` includes `completion` for chat models.
   */
  private static supportsChat(name: string, capabilities?: string[]): boolean {
    if (capabilities?.length) {
      return capabilities.includes('completion');
    }
    const n = name.toLowerCase();
    if (
      n.includes('nomic-embed') ||
      n.includes('mxbai-embed') ||
      n.startsWith('bge-') ||
      n.includes('all-minilm') ||
      /(^|[/_-])embed([/_-]|$)/.test(n) ||
      n.includes('embed-text')
    ) {
      return false;
    }
    return true;
  }

  /**
   * Priority: OLLAMA_MODEL / OLLAMA_CHAT_MODEL → model from /api/ps → first match from /api/tags → default.
   */
  async resolveModel(): Promise<string> {
    const fromEnv =
      this.configService.get<string>('OLLAMA_MODEL')?.trim() ||
      this.configService.get<string>('OLLAMA_CHAT_MODEL')?.trim();
    if (fromEnv) {
      return fromEnv;
    }

    try {
      const { data } = await axios.get<{
        models?: Array<{
          name?: string;
          model?: string;
          capabilities?: string[];
        }>;
      }>(`${this.ollamaUrl}/api/ps`);
      for (const m of data.models ?? []) {
        const name = m.name ?? m.model;
        if (name && OllamaProvider.supportsChat(name, m.capabilities)) {
          return name;
        }
      }
    } catch {
      // ignore
    }

    try {
      const { data } = await axios.get<{
        models?: Array<{ name: string; capabilities?: string[] }>;
      }>(`${this.ollamaUrl}/api/tags`);
      for (const m of data.models ?? []) {
        if (m.name && OllamaProvider.supportsChat(m.name, m.capabilities)) {
          return m.name;
        }
      }
    } catch {
      // ignore
    }

    return 'llama3.2';
  }

  async getActiveModel(): Promise<string> {
    return this.resolveModel();
  }

  chat(message: AiChatMessage): Observable<string> {
    return new Observable<string>((subscriber) => {
      let stream: Readable | undefined;
      let closed = false;
      let buffer = '';

      const parseLine = (line: string) => {
        if (!line.trim()) {
          return;
        }

        const chunk = JSON.parse(line);
        const content = chunk.message?.content;

        if (content) {
          subscriber.next(content);
        }

        if (chunk.done) {
          subscriber.complete();
        }
      };

      void (async () => {
        try {
          const model = await this.resolveModel();
          this.logger.log(`Ollama chat request: model=${model}`, 'OllamaProvider');
          const messages = OllamaProvider.toChatMessages(message);
          const response = await axios.post<Readable>(
            `${this.ollamaUrl}/api/chat`,
            {
              model,
              stream: true,
              messages,
            },
            { responseType: 'stream' },
          );

          if (closed) {
            response.data.destroy();
            return;
          }

          stream = response.data;
          stream.on('data', (data: Buffer) => {
            buffer += data.toString('utf8');
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              parseLine(line);
            }
          });
          stream.on('end', () => {
            if (buffer) {
              parseLine(buffer);
            }
            subscriber.complete();
          });
          stream.on('error', (error) => subscriber.error(error));
        } catch (error) {
          if (isAxiosError(error) && error.response?.data) {
            const raw = error.response.data;
            const detail = await OllamaProvider.formatAxiosErrorBody(raw);
            subscriber.error(
              new Error(
                `Ollama HTTP ${error.response.status} (${this.ollamaUrl}/api/chat): ${detail}`,
              ),
            );
            return;
          }
          subscriber.error(error);
        }
      })();

      return () => {
        closed = true;
        stream?.destroy();
      };
    });
  }
}
