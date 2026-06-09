import { LoggerService } from '@ai-platform/shared';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { IAIProvider } from '@ai-platform/shared';
import { ClaudeProvider } from './claude.provider';
import { OllamaProvider } from './ollama.provider';
import { LmStudioProvider } from './lmstudio.provider';

@Injectable()
export class AiProviderFactory {
  private readonly provider: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly claudeProvider: ClaudeProvider,
    private readonly ollamaProvider: OllamaProvider,
    private readonly lmStudioProvider: LmStudioProvider,
    private readonly logger: LoggerService,
  ) {
    this.provider = this.configService.get<string>('AI_PROVIDER') ?? 'ollama';
  }

  getProvider(): IAIProvider {
    this.logger.log(`Resolving AI_PROVIDER=${this.provider}`, 'AiProviderFactory');
    if (this.provider === 'claude') {
      return this.claudeProvider;
    }

    if (this.provider === 'ollama') {
      return this.ollamaProvider;
    }

    if (this.provider === 'lmstudio') {
      return this.lmStudioProvider;
    }

    this.logger.error(`Unsupported AI_PROVIDER: ${this.provider}`, undefined, 'AiProviderFactory');
    throw new Error(`Unsupported AI_PROVIDER: ${this.provider}`);
  }
}
