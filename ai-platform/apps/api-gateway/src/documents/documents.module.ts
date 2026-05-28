import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { DocumentsController } from './documents.controller';

@Module({
  imports: [AuthModule],
  controllers: [DocumentsController],
})
export class DocumentsModule {}
