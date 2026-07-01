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

  // Run mode. Accepted-but-ignored for back-compat; it does NOT gate the limits below.
  @IsOptional()
  @IsIn(['chat', 'agent'])
  mode?: AgentRunConfig['mode'];

  // Optional safeguard limits applied on the ordinary chat request, independent of `mode`.
  // Positive integers only.
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

export class CancelChatRequestDto {
  // Conversation whose active run should be cancelled. Required and non-empty;
  // missing/blank values are rejected with a 400 by the global validation pipe.
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  conversationId!: string;
}
