import { DatabaseModule } from '@ai-platform/database';
import { KafkaModule } from '@ai-platform/kafka';
import { LoggerModule } from '@ai-platform/shared';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AgentModule } from '../agent/agent.module';
import { AiModule } from '../ai/ai.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { VaultModule } from '../vault/vault.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    LoggerModule,
    KafkaModule.forRoot({
      clientId: process.env.KAFKA_CLIENT_ID ?? 'ai-service',
      brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(','),
      groupId: process.env.KAFKA_GROUP_ID ?? 'ai-service',
    }),
    AiModule,
    AgentModule,
    KnowledgeModule,
    VaultModule,
  ],
})
export class AppModule {}
