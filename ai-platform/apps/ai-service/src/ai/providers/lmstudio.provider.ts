import { AiChatMessage, IAIProvider, LoggerService } from '@ai-platform/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { isAxiosError } from 'axios';
import { Observable } from 'rxjs';
import { Readable } from 'stream';

type OpenAiRole = 'system' | 'user' | 'assistant';

@Injectable()
export class LmStudioProvider implements IAIProvider {
  private readonly baseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly logger: LoggerService,
  ) {
    this.baseUrl =
      this.configService.get<string>('LMSTUDIO_CHAT_URL') ?? 'http://localhost:1234/v1';
  }

  /**
   * Convert messages for LM Studio /chat/completions (OpenAI-compatible).
   * Unlike Ollama, roles are preserved natively (system/user/assistant).
   */
  private static toOpenAiMessages(
    message: AiChatMessage,
  ): Array<{ role: OpenAiRole; content: string }> {
    if (typeof message === 'string') {
      return [{ role: 'user', content: message }];
    }
    if (!Array.isArray(message)) {
      return [
        { role: 'system', content: message.system },
        { role: 'user', content: message.user },
      ];
    }
    return message.map((m) => ({ role: m.role, content: m.content }));
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
   * Priority: LMSTUDIO_CHAT_MODEL env → first id from GET /models → throw.
   * No hardcoded default model.
   */
  async resolveModel(): Promise<string> {
    const fromEnv = this.configService.get<string>('LMSTUDIO_CHAT_MODEL')?.trim();
    if (fromEnv) {
      return fromEnv;
    }

    const { data } = await axios.get<{ data?: Array<{ id: string }> }>(`${this.baseUrl}/models`);
    const first = data.data?.[0]?.id;
    if (first) {
      return first;
    }

    throw new Error(
      'No LM Studio model loaded — set LMSTUDIO_CHAT_MODEL or load a model in LM Studio',
    );
  }

  async getActiveModel(): Promise<string> {
    return this.resolveModel();
  }

  chat(message: AiChatMessage): Observable<string> {
    return new Observable<string>((subscriber) => {
      let stream: Readable | undefined;
      let closed = false;
      let buffer = '';

      const parseSseLine = (line: string) => {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data:')) {
          return;
        }

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          subscriber.complete();
          return;
        }

        const json = JSON.parse(payload);
        const content = json.choices?.[0]?.delta?.content;
        if (content) {
          subscriber.next(content);
        }
      };

      void (async () => {
        try {
          const model = await this.resolveModel();
          this.logger.log(`LM Studio chat request: model=${model}`, 'LmStudioProvider');
          const messages = LmStudioProvider.toOpenAiMessages(message);
          const response = await axios.post<Readable>(
            `${this.baseUrl}/chat/completions`,
            {
              model,
              messages,
              stream: true,
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
              parseSseLine(line);
            }
          });
          stream.on('end', () => {
            if (buffer) {
              parseSseLine(buffer);
            }
            subscriber.complete();
          });
          stream.on('error', (error) => subscriber.error(error));
        } catch (error) {
          if (isAxiosError(error) && error.response?.data) {
            const raw = error.response.data;
            const detail = await LmStudioProvider.formatAxiosErrorBody(raw);
            subscriber.error(
              new Error(
                `LM Studio chat HTTP ${error.response.status} (${this.baseUrl}/chat/completions): ${detail}`,
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
