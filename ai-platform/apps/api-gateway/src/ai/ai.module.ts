import { DatabaseModule } from '@ai-platform/database';
import { KafkaModule } from '@ai-platform/kafka';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AiController } from './ai.controller';

@Module({
  imports: [
    AuthModule,
    DatabaseModule,
    KafkaModule.forRoot({
      clientId: 'api-gateway',
      brokers: [process.env.KAFKA_BROKER ?? 'localhost:9092'],
      groupId: 'api-gateway-ai',
    }),
  ],
  controllers: [AiController],
})
export class AiModule {}
