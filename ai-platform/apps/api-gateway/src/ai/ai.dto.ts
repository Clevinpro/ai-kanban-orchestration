import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsPositive, IsString } from 'class-validator';
import type { AgentRunConfig } from '@ai-platform/shared';

export class ChatRequestDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  message!: string;

  @IsOptional()
  @IsString()
  conversationId?: string;

  // Run mode. Omitted preserves today's chat behavior; 'agent' enables the agent loop.
  @IsOptional()
  @IsIn(['chat', 'agent'])
  mode?: AgentRunConfig['mode'];

  // Optional agent-run limits. Positive integers only.
  @IsOptional()
  @IsInt()
  @IsPositive()
  maxIterations?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  tokenBudget?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  timeoutMs?: number;
}
