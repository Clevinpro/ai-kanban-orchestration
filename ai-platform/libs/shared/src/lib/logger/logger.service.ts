import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';

@Injectable()
export class LoggerService implements NestLoggerService {
  constructor(private readonly pino: PinoLogger) {}

  log(message: string, context?: string, meta?: Record<string, unknown>): void {
    this.pino.info(this.fields(context, meta), message);
  }

  error(message: string, trace?: string, context?: string, meta?: Record<string, unknown>): void {
    this.pino.error(this.fields(context, { trace, ...meta }), message);
  }

  warn(message: string, context?: string, meta?: Record<string, unknown>): void {
    this.pino.warn(this.fields(context, meta), message);
  }

  debug(message: string, context?: string, meta?: Record<string, unknown>): void {
    this.pino.debug(this.fields(context, meta), message);
  }

  verbose(message: string, context?: string, meta?: Record<string, unknown>): void {
    this.pino.trace(this.fields(context, meta), message);
  }

  private fields(context?: string, meta?: Record<string, unknown>): Record<string, unknown> {
    return {
      context,
      ...meta,
    };
  }
}
