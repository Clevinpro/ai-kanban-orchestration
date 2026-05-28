import { Module } from '@nestjs/common';
import { DocumentModule } from '../document/document.module';
import { VaultController } from './vault.controller';
import { VaultSyncService } from './vault-sync.service';

@Module({
  imports: [DocumentModule],
  controllers: [VaultController],
  providers: [VaultSyncService],
  exports: [VaultSyncService],
})
export class VaultModule {}
