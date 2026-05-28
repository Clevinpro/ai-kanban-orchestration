import { IsString, MaxLength } from 'class-validator';

export class CreateConversationDto {
  @IsString()
  @MaxLength(512)
  title!: string;
}
