import { Module } from '@nestjs/common';
import { DocumentModule } from '../document/document.module';
import { EmbeddingsModule } from '../embeddings/embeddings.module';
import { VaultController } from './vault.controller';
import { VaultSyncService } from './vault-sync.service';

@Module({
  imports: [DocumentModule, EmbeddingsModule],
  controllers: [VaultController],
  providers: [VaultSyncService],
  exports: [VaultSyncService],
})
export class VaultModule {}
