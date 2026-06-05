import { Module } from '@nestjs/common';
import { AiProvidersModule } from '../ai/ai-providers.module';
import { SearchModule } from '../search/search.module';
import { AgentController } from './agent.controller';
import { AgentRunnerService } from './agent-runner.service';

/**
 * Agent runtime module. Provides the bounded reason→act loop runner, reusing
 * the AI provider factory (from `AiProvidersModule`) and the hybrid
 * `SearchService` (from `SearchModule`). Exposes the run over SSE via
 * `AgentController`.
 *
 * Depends on `AiProvidersModule` (Kafka-free) rather than the full `AiModule`
 * so the controller can be hosted in the ai-service HTTP server without
 * dragging Kafka into that module graph.
 */
@Module({
  imports: [AiProvidersModule, SearchModule],
  controllers: [AgentController],
  providers: [AgentRunnerService],
  exports: [AgentRunnerService],
})
export class AgentModule {}
