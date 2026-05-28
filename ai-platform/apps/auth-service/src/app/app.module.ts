import { Module } from '@nestjs/common';
import { LoggerModule } from '@ai-platform/shared';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [LoggerModule, AuthModule],
})
export class AppModule {}
