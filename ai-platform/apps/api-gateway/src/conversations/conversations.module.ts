import { DatabaseModule } from '@ai-platform/database';
import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { ConversationsController } from './conversations.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [ConversationsController],
})
export class ConversationsModule {}
