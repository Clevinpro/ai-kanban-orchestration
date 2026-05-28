import { IsNotEmpty, IsString } from 'class-validator';

export class SyncVaultDto {
  @IsString()
  @IsNotEmpty()
  filePath!: string;
}
