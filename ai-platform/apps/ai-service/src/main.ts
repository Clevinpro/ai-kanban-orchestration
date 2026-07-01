import { AI_PROVIDER, LoggerModule, LoggerService } from '@ai-platform/shared';
import { Controller, Get, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import { AppModule } from './app/app.module';
import { DocumentModule } from './document/document.module';
import { VaultModule } from './vault/vault.module';

interface HealthResponse {
  status: 'ok';
  provider: string;
}

@Controller()
class HealthController {
  constructor(private readonly logger: LoggerService) {}

  @Get('health')
  health(): HealthResponse {
    this.logger.debug('GET /api/health', 'HealthController');
    return {
      status: 'ok',
      provider: process.env.AI_PROVIDER ?? AI_PROVIDER.OLLAMA,
    };
  }
}

@Module({
  imports: [LoggerModule, ConfigModule.forRoot({ isGlobal: true }), DocumentModule, VaultModule],
  controllers: [HealthController],
})
class HttpAppModule {}

async function bootstrap() {
  const kafkaOptions: MicroserviceOptions = {
    transport: Transport.KAFKA,
    options: {
      client: {
        clientId: process.env.KAFKA_CLIENT_ID ?? 'ai-service',
        brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
        retry: {
          initialRetryTime: 300,
          retries: 15,
        },
      },
      consumer: {
        groupId: process.env.KAFKA_GROUP_ID ?? 'ai-service',
      },
    },
  };

  const [app, kafkaConsumer] = await Promise.all([
    NestFactory.create(HttpAppModule, { bufferLogs: true }),
    NestFactory.createMicroservice<MicroserviceOptions>(AppModule, {
      ...kafkaOptions,
      bufferLogs: true,
    }),
  ]);

  const logger = app.get(LoggerService);
  app.useLogger(logger);
  kafkaConsumer.useLogger(logger);

  const aiAgent = process.env.AI_PROVIDER ?? AI_PROVIDER.OLLAMA;
  logger.log(`Startup: AI agent from .env (AI_PROVIDER)=${aiAgent}`, 'AiService');

  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  const port = Number(process.env.AI_SERVICE_PORT ?? 4001);

  await Promise.all([app.listen(port), kafkaConsumer.listen()]);

  logger.log(
    `ai-service HTTP server started on port ${port} (prefix /${globalPrefix})`,
    'AiService',
  );
  logger.log('ai-service Kafka consumer started', 'AiService');
}

bootstrap();
