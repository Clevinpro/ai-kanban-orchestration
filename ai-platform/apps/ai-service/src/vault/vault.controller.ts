import { LoggerService } from '@ai-platform/shared';
import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { SyncVaultDto } from './dto/sync-vault.dto';
import { VaultSyncService } from './vault-sync.service';

@Controller('vault')
export class VaultController {
  constructor(
    private readonly vaultSyncService: VaultSyncService,
    private readonly logger: LoggerService,
  ) {}

  @Post('sync')
  @HttpCode(HttpStatus.OK)
  async syncFile(
    @Body() body: SyncVaultDto,
  ): Promise<{ documentId: string; chunksCount: number }> {
    this.logger.log(`VaultController: sync requested for "${body.filePath}"`, 'VaultController');
    const result = await this.vaultSyncService.syncFile(body.filePath);
    this.logger.log(
      `VaultController: sync complete — documentId=${result.documentId}, chunks=${result.chunksCount}`,
      'VaultController',
    );
    return result;
  }

  @Get('status')
  getStatus(): { indexed: number; lastSync: string } {
    return this.vaultSyncService.getStatus();
  }
}
