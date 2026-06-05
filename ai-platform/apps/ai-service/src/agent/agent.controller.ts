import { IAgentConfig, IAgentEvent, LoggerService } from '@ai-platform/shared';
import { Controller, MessageEvent, Query, Sse } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { AgentRunnerService } from './agent-runner.service';

/**
 * Default bounds applied to an agent run when the client does not supply them.
 * Kept conservative so an unconfigured request still terminates quickly.
 */
const DEFAULT_AGENT_CONFIG: IAgentConfig = {
  maxIterations: 8,
  tokenBudget: 20000,
  timeoutMs: 60000,
};

/**
 * HTTP entrypoint for the agent runtime.
 *
 * Transport Option A (per SPEC): the SSE endpoint subscribes to
 * `AgentRunnerService.run(...)` directly in-process — no Kafka round-trip — and
 * maps each `IAgentEvent` to exactly one NestJS `MessageEvent` whose `data` is
 * the JSON-encoded event (mirroring the existing `@Sse('chat/stream')` handler).
 *
 * The controller is mounted under `@Controller('ai')`; with the ai-service HTTP
 * global prefix the route resolves to `/api/ai/agent/stream`, which the browser
 * reaches as `/ai/agent/stream` through the gateway proxy.
 */
@Controller('ai')
export class AgentController {
  constructor(
    private readonly agentRunner: AgentRunnerService,
    private readonly logger: LoggerService,
  ) {}

  @Sse('agent/stream')
  stream(
    @Query('task') task = '',
    @Query('maxIterations') maxIterations?: string,
    @Query('tokenBudget') tokenBudget?: string,
    @Query('timeoutMs') timeoutMs?: string,
  ): Observable<MessageEvent> {
    const config = this.resolveConfig(maxIterations, tokenBudget, timeoutMs);

    this.logger.log('Agent stream opened', AgentController.name, {
      task,
      config,
    });

    // One IAgentEvent → one MessageEvent. The SSE payload contract is a single
    // JSON-encoded event per message; keep field names stable across the
    // boundary so the frontend `switch(type)` round-trips.
    return this.agentRunner
      .run(task, config)
      .pipe(map((event: IAgentEvent): MessageEvent => ({ data: JSON.stringify(event) })));
  }

  /**
   * Build a resolved `IAgentConfig`, applying server-side defaults for any
   * bound the client omitted or sent as a non-positive / non-numeric value.
   */
  private resolveConfig(
    maxIterations?: string,
    tokenBudget?: string,
    timeoutMs?: string,
  ): IAgentConfig {
    return {
      maxIterations: this.parsePositiveInt(maxIterations, DEFAULT_AGENT_CONFIG.maxIterations),
      tokenBudget: this.parsePositiveInt(tokenBudget, DEFAULT_AGENT_CONFIG.tokenBudget),
      timeoutMs: this.parsePositiveInt(timeoutMs, DEFAULT_AGENT_CONFIG.timeoutMs),
    };
  }

  private parsePositiveInt(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
  }
}
