import { Global, Module } from '@nestjs/common';
import { LoggerModule as PinoLoggerModule, type Params } from 'nestjs-pino';
import type { LoggerOptions } from 'pino';
import type { Options as PinoHttpOptions } from 'pino-http';
import { LoggerService } from './logger.service';
import { LogLevel } from './logger.constants';

@Global()
@Module({
  imports: [
    PinoLoggerModule.forRootAsync({
      useFactory: (): Params => {
        const nodeEnv = process.env['NODE_ENV'] ?? 'development';
        const logLevel = (process.env['LOG_LEVEL'] as LogLevel) ?? LogLevel.Info;
        const isDevelopment = nodeEnv !== 'production';

        const pinoHttp: PinoHttpOptions & LoggerOptions = {
          level: logLevel,
          serializers: {
            req(req) {
              return {
                id: req.id,
                method: req.method,
                url: req.url,
              };
            },
            res(res) {
              return {
                statusCode: res.statusCode,
              };
            },
          },
          customSuccessMessage(req, res, responseTime) {
            return `${req.method} ${req.url} ${res.statusCode} ${responseTime}ms`;
          },
          customErrorMessage(req, res, error) {
            return `${req.method} ${req.url} ${res.statusCode} ${error.message}`;
          },
          formatters: {
            level(label: string) {
              return { level: label };
            },
          },
          timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
          base: undefined,
        };

        if (isDevelopment) {
          pinoHttp.transport = {
            target: 'pino-pretty',
            options: {
              colorize: true,
              singleLine: true,
              translateTime: 'SYS:standard',
              ignore: 'pid,hostname,req,res,responseTime',
              messageFormat: '{msg}',
            },
          };
        }

        return {
          pinoHttp,
        };
      },
    }),
  ],
  providers: [LoggerService],
  exports: [LoggerService],
})
export class LoggerModule {}
